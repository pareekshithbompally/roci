//! The microphone: resolving and opening the input, following the system
//! default and the audio service, and which format a stream opens in.

use std::ffi::c_void;
use std::sync::Once;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{
    BufferSize, Device, SampleFormat, SizedSample, Stream, StreamConfig, SupportedBufferSize,
    SupportedStreamConfig,
};
use eyre::{Result, WrapErr, eyre};

use super::lid;
use super::transport::{Transport, transport};

static AUDIO_SERVICE_RESTART_GENERATION: AtomicU64 = AtomicU64::new(0);
static INPUT_ROUTE_GENERATION: AtomicU64 = AtomicU64::new(0);

pub fn notify_audio_service_restarted() {
    AUDIO_SERVICE_RESTART_GENERATION.fetch_add(1, Ordering::AcqRel);
}

pub fn audio_service_restart_generation() -> u64 {
    AUDIO_SERVICE_RESTART_GENERATION.load(Ordering::Acquire)
}

/// Advances when the OS's default input or its list of inputs changes, or
/// a MacBook's lid opens or closes, so an input following the system
/// default resolves again. macOS reports these through CoreAudio listeners
/// and an IOKit interest notification.
pub fn input_route_generation() -> u64 {
    INPUT_ROUTE_GENERATION.load(Ordering::Acquire)
}

fn notify_input_route_changed() {
    INPUT_ROUTE_GENERATION.fetch_add(1, Ordering::AcqRel);
}

/// Registers the CoreAudio listeners behind [`audio_service_restart_generation`]
/// and [`input_route_generation`]. Their callbacks run on CoreAudio's
/// notification thread, never the audio callback, and only bump a counter.
pub fn watch_input_devices() {
    #[repr(C)]
    struct AudioObjectPropertyAddress {
        m_selector: u32,
        m_scope: u32,
        m_element: u32,
    }

    type PropertyListenerProc =
        unsafe extern "C" fn(u32, u32, *const AudioObjectPropertyAddress, *mut c_void) -> i32;

    unsafe extern "C" {
        fn AudioObjectAddPropertyListener(
            in_object_id: u32,
            in_address: *const AudioObjectPropertyAddress,
            in_listener: PropertyListenerProc,
            in_client_data: *mut c_void,
        ) -> i32;
    }

    unsafe extern "C" fn on_service_restarted(
        _in_object_id: u32,
        _in_number_addresses: u32,
        _in_addresses: *const AudioObjectPropertyAddress,
        _in_client_data: *mut c_void,
    ) -> i32 {
        tracing::warn!("CoreAudio daemon (coreaudiod) restarted; recovering microphone stream");
        notify_audio_service_restarted();
        0
    }

    unsafe extern "C" fn on_inputs_changed(
        _in_object_id: u32,
        _in_number_addresses: u32,
        _in_addresses: *const AudioObjectPropertyAddress,
        _in_client_data: *mut c_void,
    ) -> i32 {
        notify_input_route_changed();
        0
    }

    static REGISTER: Once = Once::new();
    REGISTER.call_once(|| {
        const SYSTEM_OBJECT: u32 = 1;
        const SERVICE_RESTARTED_SELECTOR: u32 = u32::from_be_bytes(*b"srst");
        const DEFAULT_INPUT_SELECTOR: u32 = u32::from_be_bytes(*b"dIn ");
        const DEVICES_SELECTOR: u32 = u32::from_be_bytes(*b"dev#");
        const GLOBAL_SCOPE: u32 = u32::from_be_bytes(*b"glob");
        let listeners: [(u32, PropertyListenerProc); 3] = [
            (SERVICE_RESTARTED_SELECTOR, on_service_restarted),
            (DEFAULT_INPUT_SELECTOR, on_inputs_changed),
            (DEVICES_SELECTOR, on_inputs_changed),
        ];
        for (selector, listener) in listeners {
            let addr = AudioObjectPropertyAddress {
                m_selector: selector,
                m_scope: GLOBAL_SCOPE,
                m_element: 0,
            };
            let status = unsafe {
                AudioObjectAddPropertyListener(SYSTEM_OBJECT, &addr, listener, std::ptr::null_mut())
            };
            if status != 0 {
                tracing::warn!(status, "could not watch CoreAudio input devices");
            }
        }
        // Closing the lid switches the built-in microphone off without
        // changing CoreAudio's device list or default input.
        lid::watch(notify_input_route_changed);
    });
}

pub struct AudioInput {
    _stream: Stream,
    chunks: Receiver<Vec<f32>>,
    pub sample_rate: u32,
    pub device_name: String,
    stream_errors: Receiver<String>,
    restart_generation: u64,
    /// When the stream opened or last delivered a chunk.
    last_delivery: Mutex<Instant>,
}

/// A running stream delivers audio every few milliseconds, even silence. One
/// that has delivered nothing for this long has stopped without reporting an
/// error and is reopened.
const STREAM_STALL_TIMEOUT: Duration = Duration::from_secs(4);

pub enum AudioInputEvent {
    Chunk { samples: Vec<f32> },
    Timeout,
    StreamFailed(String),
}

/// What resolving and opening the input found.
pub enum Opened {
    Input(Box<AudioInput>),
    /// The input resolved to the device already open, which was kept.
    Unchanged,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum InputTarget {
    /// The OS's default input.
    SystemDefault,
    /// A real input standing in for a default that is the built-in
    /// microphone with the lid closed, or missing: the built-in microphone
    /// while the lid is open, else the first usable one listed, never a
    /// virtual input or an iPhone's Continuity microphone.
    StandIn(usize),
}

const LID_CLOSED_ERROR: &str = "the built-in microphone is off while the lid is closed";
const NO_MICROPHONE_ERROR: &str = "no microphone is available";

impl AudioInput {
    fn open_device(device: Device, device_name: String) -> Result<Self> {
        watch_input_devices();
        let restart_generation = audio_service_restart_generation();
        let started = start_stream_with_fallback(&device, &device_name)?;

        Ok(Self {
            _stream: started.stream,
            chunks: started.chunks,
            sample_rate: started.sample_rate,
            device_name,
            stream_errors: started.stream_errors,
            restart_generation,
            last_delivery: Mutex::new(Instant::now()),
        })
    }

    pub fn recv_timeout(&self, timeout: Duration) -> AudioInputEvent {
        if audio_service_restart_generation() != self.restart_generation {
            return AudioInputEvent::StreamFailed("CoreAudio service restarted".into());
        }
        // A stream failure reported before or during the wait outranks any
        // chunk delivered alongside it.
        if let Ok(error) = self.stream_errors.try_recv() {
            return AudioInputEvent::StreamFailed(error);
        }
        let received = self.chunks.recv_timeout(timeout);
        if audio_service_restart_generation() != self.restart_generation {
            return AudioInputEvent::StreamFailed("CoreAudio service restarted".into());
        }
        if let Ok(error) = self.stream_errors.try_recv() {
            return AudioInputEvent::StreamFailed(error);
        }
        match received {
            Ok(samples) => {
                *self
                    .last_delivery
                    .lock()
                    .unwrap_or_else(|error| error.into_inner()) = Instant::now();
                AudioInputEvent::Chunk { samples }
            }
            Err(RecvTimeoutError::Timeout) => {
                let stalled = self
                    .last_delivery
                    .lock()
                    .unwrap_or_else(|error| error.into_inner())
                    .elapsed()
                    >= STREAM_STALL_TIMEOUT;
                if stalled {
                    AudioInputEvent::StreamFailed("microphone stopped delivering audio".into())
                } else {
                    AudioInputEvent::Timeout
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                AudioInputEvent::StreamFailed("microphone audio channel disconnected".into())
            }
        }
    }
}

/// Resolves the input to capture from: the system default, unless it is the
/// built-in microphone with the lid closed (switched off in hardware though
/// still listed) or missing, when a real input stands in.
fn resolve_input(
    names: &[String],
    default: Option<&str>,
    transport: impl Fn(usize) -> Transport,
    lid_closed: bool,
) -> std::result::Result<InputTarget, String> {
    let position = |name: &str| names.iter().position(|listed| listed == name);
    let is_built_in = |index: usize| transport(index) == Transport::BuiltIn;
    let off = |index: usize| lid_closed && is_built_in(index);
    let default_usable =
        !names.is_empty() && default.is_some_and(|name| !position(name).is_some_and(off));
    if default_usable {
        return Ok(InputTarget::SystemDefault);
    }
    // A virtual device or an iPhone's Continuity microphone is used only as
    // the default, never as a stand-in: a virtual one can record silence
    // while its app is idle, and the iPhone prompts and can fail.
    let usable = || {
        (0..names.len()).filter(|&index| {
            !off(index) && !matches!(transport(index), Transport::Virtual | Transport::Continuity)
        })
    };
    usable()
        .find(|&index| is_built_in(index))
        .or_else(|| usable().next())
        .map(InputTarget::StandIn)
        .ok_or_else(|| {
            if (0..names.len()).any(off) {
                LID_CLOSED_ERROR.into()
            } else {
                NO_MICROPHONE_ERROR.into()
            }
        })
}

/// The input devices whose names can be read, with those names. A device
/// without a readable name, such as CoreAudio's placeholder when no input
/// exists, cannot be opened, so it is left out.
fn input_devices_of(host: &cpal::Host) -> Result<(Vec<Device>, Vec<String>)> {
    Ok(host
        .input_devices()
        .wrap_err("could not enumerate input devices")?
        .filter_map(|device| device_name(&device).map(|name| (device, name)))
        .unzip())
}

/// The system default input with its name, or `None` when there is none or
/// its name cannot be read.
fn default_input_of(host: &cpal::Host) -> Option<(Device, String)> {
    let device = host.default_input_device()?;
    let name = device_name(&device)?;
    Some((device, name))
}

/// The device's name. cpal's `Display` for `Device` returns `fmt::Error`
/// when the name cannot be read, which makes `to_string` panic, so read the
/// description directly.
fn device_name(device: &Device) -> Option<String> {
    description_name(device.description())
}

fn description_name<E: std::fmt::Display>(
    description: std::result::Result<cpal::DeviceDescription, E>,
) -> Option<String> {
    match description {
        Ok(description) => Some(description.name().to_owned()),
        Err(error) => {
            tracing::debug!(%error, "skipping an input device whose name cannot be read");
            None
        }
    }
}

/// Opens the microphone a meeting records, or keeps the open one named
/// `keep` when it resolves to that again.
pub fn open_meeting_input(keep: Option<&str>) -> Result<Opened> {
    let host = cpal::default_host();
    let (devices, names) = input_devices_of(&host)?;
    let (default, default_name) = default_input_of(&host).unzip();
    let transports = devices.iter().map(transport).collect::<Vec<_>>();
    let lid_closed = lid::closed();
    let target = resolve_input(
        &names,
        default_name.as_deref(),
        |index| transports[index],
        lid_closed,
    )
    .map_err(|error| eyre!(error))?;
    // Keeping the open device returns before logging, so a route change
    // that resolves to the same input logs nothing.
    let (device, name) = match target {
        InputTarget::StandIn(index) => (devices[index].clone(), names[index].clone()),
        InputTarget::SystemDefault => (
            default.clone().expect("resolved default"),
            default_name.clone().expect("resolved default"),
        ),
    };
    if keep == Some(name.as_str()) {
        return Ok(Opened::Unchanged);
    }
    if let InputTarget::StandIn(_) = target {
        tracing::warn!(
            default = default_name.as_deref().unwrap_or("none"),
            using = %name,
            lid_closed,
            "the system default input is off with the lid closed, or missing; using another microphone"
        );
    }
    let input = AudioInput::open_device(device, name)?;
    Ok(Opened::Input(Box::new(input)))
}

fn mono<T>(samples: &[T], channels: usize, convert: impl Fn(&T) -> f32) -> Vec<f32> {
    samples
        .chunks(channels)
        .map(|frame| frame.iter().map(&convert).sum::<f32>() / channels as f32)
        .collect()
}

fn report_stream_error(sender: &SyncSender<String>, error: cpal::Error) {
    if matches!(
        error.kind(),
        cpal::ErrorKind::Xrun | cpal::ErrorKind::RealtimeDenied
    ) {
        // CoreAudio reports processor overloads, common while a cold device
        // starts, without stopping the stream. Real sample gaps still surface as
        // capture discontinuities.
        tracing::warn!(%error, "microphone stream glitched; continuing");
        return;
    }
    tracing::error!(%error, "microphone stream failed");
    let _ = sender.try_send(error.to_string());
}

fn build_stream<T: SizedSample>(
    device: &Device,
    config: &StreamConfig,
    channels: usize,
    sender: Sender<Vec<f32>>,
    errors: SyncSender<String>,
    convert: impl Fn(T) -> f32 + Send + 'static,
) -> Result<Stream> {
    device
        .build_input_stream(
            *config,
            move |data: &[T], _info| {
                let mono_samples = mono(data, channels, |sample| convert(*sample));
                let _ = sender.send(mono_samples);
            },
            move |error| report_stream_error(&errors, error),
            None,
        )
        .wrap_err_with(|| format!("could not open {} microphone stream", T::FORMAT))
}

/// A started microphone stream and the channels its callback feeds.
struct StartedStream {
    stream: Stream,
    chunks: Receiver<Vec<f32>>,
    stream_errors: Receiver<String>,
    sample_rate: u32,
}

/// The most formats tried after a device refuses its default one.
const MAX_ALTERNATIVE_INPUT_CONFIGS: usize = 12;

/// Starts a stream in the device's default format. Some drivers refuse a
/// stream in the format they report as their default, so the other formats
/// they list are tried before failing with the default's error.
fn start_stream_with_fallback(device: &Device, device_name: &str) -> Result<StartedStream> {
    let supported = device
        .default_input_config()
        .wrap_err("could not read the input device configuration")?;
    let error = match start_stream(device, &supported, BufferSize::Default) {
        Ok(started) => return Ok(started),
        Err(error) => error,
    };
    tracing::warn!(
        error = format!("{error:#}"),
        device = %device_name,
        "the microphone refused its default format; trying the others it lists"
    );
    // Some drivers refuse every format with the backend's default buffer
    // yet accept the same format with an explicit buffer duration, so each
    // format is tried with explicit buffers too.
    let mut candidates = fixed_buffer_sizes(supported.sample_rate(), supported.buffer_size())
        .into_iter()
        .map(|buffer| (supported, buffer))
        .collect::<Vec<_>>();
    for candidate in alternative_input_configs(device, &supported) {
        candidates.push((candidate, BufferSize::Default));
        for fixed in fixed_buffer_sizes(candidate.sample_rate(), candidate.buffer_size()) {
            candidates.push((candidate, fixed));
        }
    }
    for (candidate, buffer_size) in candidates {
        match start_stream(device, &candidate, buffer_size) {
            Ok(started) => {
                tracing::info!(
                    device = %device_name,
                    format = %describe_config(&candidate),
                    buffer = ?buffer_size,
                    "opened the microphone in another format"
                );
                return Ok(started);
            }
            Err(error) => tracing::warn!(
                error = format!("{error:#}"),
                device = %device_name,
                buffer = ?buffer_size,
                "the microphone refused another format"
            ),
        }
    }
    Err(error)
}

/// Explicit buffers to try at `rate`: about 20 ms within the range the
/// device reports, then 20 ms and 100 ms as they are. The reported range
/// can top out at the device's short default period, which some drivers
/// refuse in shared mode while they take 20 ms or more.
fn fixed_buffer_sizes(rate: u32, reported: &SupportedBufferSize) -> Vec<BufferSize> {
    let twenty_ms = (rate / 50).max(1);
    let clamped = match *reported {
        SupportedBufferSize::Range { min, max } if min <= max => twenty_ms.clamp(min, max),
        _ => twenty_ms,
    };
    let mut sizes = Vec::with_capacity(3);
    for frames in [clamped, twenty_ms, (rate / 10).max(1)] {
        let size = BufferSize::Fixed(frames);
        if !sizes.contains(&size) {
            sizes.push(size);
        }
    }
    sizes
}

fn is_supported_sample_format(format: SampleFormat) -> bool {
    matches!(
        format,
        SampleFormat::F32 | SampleFormat::I16 | SampleFormat::U16 | SampleFormat::I32
    )
}

/// Channels, rate, and sample format, for logs and errors.
fn describe_config(config: &SupportedStreamConfig) -> String {
    format!(
        "{} channels, {} Hz, {:?}",
        config.channels(),
        config.sample_rate(),
        config.sample_format()
    )
}

/// The other formats `device` lists, at the default rate where they allow
/// it, without `default` and duplicates.
fn alternative_input_configs(
    device: &Device,
    default: &SupportedStreamConfig,
) -> Vec<SupportedStreamConfig> {
    let ranges = match device.supported_input_configs() {
        Ok(ranges) => ranges,
        Err(error) => {
            tracing::warn!(%error, "could not list the microphone's formats");
            return Vec::new();
        }
    };
    let mut candidates: Vec<SupportedStreamConfig> = Vec::new();
    for range in ranges {
        if !is_supported_sample_format(range.sample_format()) {
            continue;
        }
        let (min, max) = (range.min_sample_rate(), range.max_sample_rate());
        if min > max {
            continue;
        }
        let rate = default.sample_rate().max(min).min(max);
        let candidate = range.with_sample_rate(rate);
        let same = |other: &SupportedStreamConfig| {
            other.channels() == candidate.channels()
                && other.sample_rate() == candidate.sample_rate()
                && other.sample_format() == candidate.sample_format()
        };
        if same(default) || candidates.iter().any(same) {
            continue;
        }
        candidates.push(candidate);
        if candidates.len() >= MAX_ALTERNATIVE_INPUT_CONFIGS {
            break;
        }
    }
    candidates
}

/// Opens and starts a stream on `device` in `supported`'s format. The error
/// names the format the device refused.
fn start_stream(
    device: &Device,
    supported: &SupportedStreamConfig,
    buffer_size: BufferSize,
) -> Result<StartedStream> {
    let sample_format = supported.sample_format();
    let mut config: StreamConfig = (*supported).into();
    config.buffer_size = buffer_size;
    let sample_rate = config.sample_rate;
    let channels = usize::from(config.channels);
    let (sender, chunks) = mpsc::channel();
    let (error_sender, stream_errors) = mpsc::sync_channel(1);
    let stream = match sample_format {
        SampleFormat::F32 => build_stream(
            device,
            &config,
            channels,
            sender,
            error_sender,
            |sample: f32| sample,
        ),
        SampleFormat::I16 => build_stream(
            device,
            &config,
            channels,
            sender,
            error_sender,
            |sample: i16| sample as f32 / i16::MAX as f32,
        ),
        SampleFormat::U16 => build_stream(
            device,
            &config,
            channels,
            sender,
            error_sender,
            |sample: u16| sample as f32 / 32768.0 - 1.0,
        ),
        SampleFormat::I32 => build_stream(
            device,
            &config,
            channels,
            sender,
            error_sender,
            |sample: i32| sample as f32 / i32::MAX as f32,
        ),
        format => Err(eyre!("unsupported microphone sample format: {format:?}")),
    }
    .and_then(|stream| {
        stream
            .play()
            .wrap_err("could not start microphone capture")?;
        Ok(stream)
    })
    // One message, so a log line or status that shows only the outer error
    // still names the refused format and the driver's reason.
    .map_err(|error| {
        eyre!(
            "could not open the microphone ({}): {error:#}",
            describe_config(supported)
        )
    })?;
    Ok(StartedStream {
        stream,
        chunks,
        stream_errors,
        sample_rate,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn listed(names: &[&str]) -> Vec<String> {
        names.iter().map(|name| (*name).to_owned()).collect()
    }

    fn built_in_at(at: usize) -> impl Fn(usize) -> Transport {
        move |index| {
            if index == at {
                Transport::BuiltIn
            } else {
                Transport::Other
            }
        }
    }

    #[test]
    fn a_headphone_jack_microphone_is_used_with_the_lid_closed() {
        use InputTarget::{StandIn, SystemDefault};
        let names = listed(&["MacBook Pro Microphone", "External Microphone"]);
        // The jack input reads as Other, so only the internal one is off.
        let transport = built_in_at(0);
        assert_eq!(
            resolve_input(&names, Some("External Microphone"), &transport, true),
            Ok(SystemDefault)
        );
        assert_eq!(
            resolve_input(&names, Some("MacBook Pro Microphone"), &transport, true),
            Ok(StandIn(1))
        );
    }

    #[test]
    fn a_closed_lid_passes_over_the_built_in_microphone() {
        use InputTarget::{StandIn, SystemDefault};
        let names = listed(&[
            "MacBook Pro Microphone",
            "Studio Display Microphone",
            "USB Mic",
        ]);
        let built_in = built_in_at(0);
        let closed = |default| resolve_input(&names, default, &built_in, true);

        // A built-in default stands in with the first other real input.
        assert_eq!(closed(Some("MacBook Pro Microphone")), Ok(StandIn(1)));
        // So does a missing default: never the built-in.
        assert_eq!(closed(None), Ok(StandIn(1)));
        // Another default is still followed.
        assert_eq!(closed(Some("USB Mic")), Ok(SystemDefault));
        // With the lid open the built-in microphone is used as before.
        assert_eq!(
            resolve_input(&names, Some("MacBook Pro Microphone"), &built_in, false),
            Ok(SystemDefault)
        );
        // With nothing else to use, say why rather than record silence.
        let only_built_in = listed(&["MacBook Pro Microphone"]);
        for default in [Some("MacBook Pro Microphone"), None] {
            assert_eq!(
                resolve_input(&only_built_in, default, &built_in_at(0), true),
                Err(LID_CLOSED_ERROR.into())
            );
        }
    }

    #[test]
    fn a_virtual_input_never_stands_in() {
        use InputTarget::{StandIn, SystemDefault};
        use Transport::{Bluetooth, BuiltIn, Other, Virtual};

        // Lid closed, only the built-in microphone and Teams: say why.
        let lid = listed(&["MacBook Pro Microphone", "Microsoft Teams Audio"]);
        let lid_transports = |index: usize| [BuiltIn, Virtual][index];
        assert_eq!(
            resolve_input(&lid, Some("MacBook Pro Microphone"), lid_transports, true),
            Err(LID_CLOSED_ERROR.into())
        );
        // A real input still stands in ahead of it.
        let with_usb = listed(&["MacBook Pro Microphone", "Microsoft Teams Audio", "USB Mic"]);
        let usb_transports = |index: usize| [BuiltIn, Virtual, Other][index];
        assert_eq!(
            resolve_input(&with_usb, Some("MacBook Pro Microphone"), usb_transports, true),
            Ok(StandIn(2))
        );
        // Only a virtual input: nothing to record from.
        let virtual_only = listed(&["Microsoft Teams Audio"]);
        assert_eq!(
            resolve_input(&virtual_only, None, |_| Virtual, false),
            Err(NO_MICROPHONE_ERROR.into())
        );
        // A virtual default is used as named.
        let headset = listed(&["Microsoft Teams Audio", "AirPods Pro"]);
        let headset_transports = |index: usize| [Virtual, Bluetooth][index];
        assert_eq!(
            resolve_input(&headset, Some("Microsoft Teams Audio"), headset_transports, false),
            Ok(SystemDefault)
        );
    }

    #[test]
    fn an_unreadable_device_name_is_skipped_instead_of_panicking() {
        let unreadable: std::result::Result<cpal::DeviceDescription, cpal::Error> =
            Err(cpal::ErrorKind::DeviceNotAvailable.into());
        assert_eq!(description_name(unreadable), None);
        let readable: std::result::Result<_, cpal::Error> = Ok(
            cpal::DeviceDescriptionBuilder::new("MacBook Pro Microphone")
                .manufacturer("Apple Inc.")
                .build(),
        );
        assert_eq!(
            description_name(readable).as_deref(),
            Some("MacBook Pro Microphone")
        );
    }

    #[test]
    fn stream_failures_are_visible_to_the_audio_owner() {
        let (sender, errors) = mpsc::sync_channel(1);

        report_stream_error(
            &sender,
            cpal::Error::with_message(
                cpal::ErrorKind::StreamInvalidated,
                "Device sample rate changed",
            ),
        );

        assert_eq!(errors.try_recv().unwrap(), "Device sample rate changed");
    }

    #[test]
    fn overload_glitches_do_not_interrupt_the_stream() {
        let (sender, errors) = mpsc::sync_channel(1);

        report_stream_error(&sender, cpal::ErrorKind::Xrun.into());
        report_stream_error(&sender, cpal::ErrorKind::RealtimeDenied.into());
        assert!(errors.try_recv().is_err());

        report_stream_error(&sender, cpal::ErrorKind::DeviceNotAvailable.into());
        assert!(errors.try_recv().is_ok());
    }

    #[test]
    fn fixed_buffers_go_past_a_short_reported_range() {
        // A range that tops out at a 10 ms period still gets 20 ms and 100 ms.
        let reported = SupportedBufferSize::Range { min: 144, max: 480 };
        assert_eq!(
            fixed_buffer_sizes(48_000, &reported),
            vec![
                BufferSize::Fixed(480),
                BufferSize::Fixed(960),
                BufferSize::Fixed(4_800),
            ]
        );
        assert_eq!(
            fixed_buffer_sizes(48_000, &SupportedBufferSize::Unknown),
            vec![BufferSize::Fixed(960), BufferSize::Fixed(4_800)]
        );
    }
}
