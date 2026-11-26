//! System voices via AVFAudio (Mac, iPhone, iPad); the delegate fires on the main thread, so speaking waits on a channel.
//! Rendering (Save in Read Aloud) writes the same speech to buffers instead of the speaker.

use std::ptr::NonNull;
use std::sync::mpsc::{self, Sender};
use std::time::Duration;

use block2::RcBlock;

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_avf_audio::{
    AVAudioBuffer, AVAudioCommonFormat, AVAudioPCMBuffer, AVSpeechBoundary, AVSpeechSynthesisVoice, AVSpeechSynthesisVoiceQuality, AVSpeechSynthesisVoiceTraits,
    AVSpeechSynthesizer, AVSpeechSynthesizerDelegate, AVSpeechUtterance,
};
use objc2_foundation::{NSObject, NSObjectProtocol, NSString};

use super::{Halt, VoiceOption};
use crate::models::LocalError;

/// The first voice listed: the one set in Spoken Content (no voice passed to AVFAudio).
const SYSTEM_VOICE: &str = "system";

/// The system voice, then installed voices for `language`, best quality first, novelty voices left out.
pub fn voices(language: &str) -> Vec<VoiceOption> {
    let system = VoiceOption { id: SYSTEM_VOICE.to_string(), name: "System voice".to_string(), detail: None };
    std::iter::once(system).chain(installed(language)).collect()
}

fn installed(language: &str) -> Vec<VoiceOption> {
    let prefix = format!("{language}-");
    let mut found: Vec<(isize, VoiceOption)> = unsafe { AVSpeechSynthesisVoice::speechVoices() }
        .iter()
        .filter(|v| unsafe { v.language() }.to_string().starts_with(&prefix))
        .filter(|v| !unsafe { v.voiceTraits() }.contains(AVSpeechSynthesisVoiceTraits::IsNoveltyVoice))
        .map(|v| {
            let quality = unsafe { v.quality() };
            let option = VoiceOption {
                id: unsafe { v.identifier() }.to_string(),
                name: unsafe { v.name() }.to_string(),
                detail: quality_label(quality),
            };
            (quality.0, option)
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.name.cmp(&b.1.name)));
    found.into_iter().map(|(_, voice)| voice).collect()
}

fn quality_label(quality: AVSpeechSynthesisVoiceQuality) -> Option<&'static str> {
    match quality {
        AVSpeechSynthesisVoiceQuality::Premium => Some("Premium"),
        AVSpeechSynthesisVoiceQuality::Enhanced => Some("Enhanced"),
        _ => None,
    }
}

/// What the synthesizer reports about the queued utterances, in order, and the reply's stop.
enum Progress {
    Started,
    Finished,
    Cancelled,
    Stop,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements; this class has no Drop.
    #[unsafe(super(NSObject))]
    #[name = "RociSpeechProgress"]
    #[ivars = Sender<Progress>]
    struct SpeechProgress;

    unsafe impl NSObjectProtocol for SpeechProgress {}

    unsafe impl AVSpeechSynthesizerDelegate for SpeechProgress {
        #[unsafe(method(speechSynthesizer:didStartSpeechUtterance:))]
        fn did_start(&self, _synthesizer: &AVSpeechSynthesizer, _utterance: &AVSpeechUtterance) {
            self.report(Progress::Started);
        }

        #[unsafe(method(speechSynthesizer:didFinishSpeechUtterance:))]
        fn did_finish(&self, _synthesizer: &AVSpeechSynthesizer, _utterance: &AVSpeechUtterance) {
            self.report(Progress::Finished);
        }

        #[unsafe(method(speechSynthesizer:didCancelSpeechUtterance:))]
        fn did_cancel(&self, _synthesizer: &AVSpeechSynthesizer, _utterance: &AVSpeechUtterance) {
            self.report(Progress::Cancelled);
        }
    }
);

impl SpeechProgress {
    fn new(events: Sender<Progress>) -> Retained<Self> {
        let this = Self::alloc().set_ivars(events);
        unsafe { msg_send![super(this), init] }
    }

    fn report(&self, progress: Progress) {
        let _ = self.ivars().send(progress); // the speaker may have stopped listening
    }
}

/// Speaks `chunks` in `voice` (None = Spoken Content's), calling `on_chunk` as each begins; ends on `halt`.
pub fn speak(chunks: &[String], voice: Option<&str>, halt: &Halt, mut on_chunk: impl FnMut(&str)) -> Result<(), LocalError> {
    let voice = voice.filter(|id| *id != SYSTEM_VOICE);
    let (events, inbox) = mpsc::channel();
    let stopped = events.clone();
    halt.on_stop(move || {
        let _ = stopped.send(Progress::Stop);
    });
    let progress = SpeechProgress::new(events);
    let synthesizer = unsafe { AVSpeechSynthesizer::new() };
    unsafe { synthesizer.setDelegate(Some(ProtocolObject::from_ref(&*progress))) };
    let voice = voice.and_then(|id| unsafe { AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(id)) });
    for chunk in chunks {
        unsafe { synthesizer.speakUtterance(&utterance(chunk, voice.as_deref())) };
    }

    let (mut started, mut finished) = (0, 0);
    while finished < chunks.len() {
        match inbox.recv() {
            Ok(Progress::Started) => {
                if let Some(chunk) = chunks.get(started) {
                    on_chunk(chunk);
                }
                started += 1;
            }
            Ok(Progress::Finished) => finished += 1,
            Ok(Progress::Stop) => {
                unsafe { synthesizer.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate) };
                return Ok(());
            }
            Ok(Progress::Cancelled) | Err(_) => return Ok(()),
        }
    }
    Ok(())
}

/// How long one chunk may take to render before it is given up (the synthesizer answers in well under this).
const RENDER_TIMEOUT: Duration = Duration::from_secs(60);

/// What rendering one utterance sends back: a buffer of mono samples at a rate, then its end (an empty buffer).
enum Rendered {
    Audio(Vec<f32>, u32),
    Done,
}

/// The first channel of a rendered buffer as floats in [-1, 1] (float or 16-bit PCM, interleaved or not).
fn rendered(buffer: &AVAudioBuffer) -> Rendered {
    let Some(pcm) = buffer.downcast_ref::<AVAudioPCMBuffer>() else { return Rendered::Done };
    let frames = unsafe { pcm.frameLength() as usize };
    if frames == 0 {
        return Rendered::Done;
    }
    let format = unsafe { pcm.format() };
    let rate = unsafe { format.sampleRate() as u32 };
    let step = if unsafe { format.isInterleaved() } { unsafe { format.channelCount() as usize } } else { 1 };
    let samples = match unsafe { format.commonFormat() } {
        AVAudioCommonFormat::PCMFormatFloat32 => {
            let channel = unsafe { *pcm.floatChannelData() }.as_ptr();
            (0..frames).map(|i| unsafe { *channel.add(i * step) }).collect()
        }
        AVAudioCommonFormat::PCMFormatInt16 => {
            let channel = unsafe { *pcm.int16ChannelData() }.as_ptr();
            (0..frames).map(|i| f32::from(unsafe { *channel.add(i * step) }) / f32::from(i16::MAX)).collect()
        }
        _ => Vec::new(),
    };
    Rendered::Audio(samples, rate)
}

/// `chunks` spoken in `voice` into sound without playing it (AVSpeechSynthesizer's write): each chunk's mono samples and
/// rate, in order. The buffers arrive on the main queue, so call it off the main thread (it waits for them).
pub fn render(chunks: &[String], voice: Option<&str>) -> Result<Vec<(Vec<f32>, u32)>, LocalError> {
    let voice = voice.filter(|id| *id != SYSTEM_VOICE).and_then(|id| unsafe { AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(id)) });
    let synthesizer = unsafe { AVSpeechSynthesizer::new() };
    let mut parts = Vec::with_capacity(chunks.len());
    for chunk in chunks {
        let (sender, inbox) = mpsc::channel();
        let callback = RcBlock::new(move |buffer: NonNull<AVAudioBuffer>| {
            let _ = sender.send(rendered(unsafe { buffer.as_ref() })); // rendering may have been given up
        });
        unsafe { synthesizer.writeUtterance_toBufferCallback(&utterance(chunk, voice.as_deref()), RcBlock::as_ptr(&callback)) };
        let mut samples = Vec::new();
        let mut rate = 0;
        loop {
            match inbox.recv_timeout(RENDER_TIMEOUT) {
                Ok(Rendered::Audio(more, at)) => {
                    samples.extend(more);
                    rate = at;
                }
                Ok(Rendered::Done) => break,
                Err(_) => return Err(LocalError::Engine("The system voice didn't render this".into())),
            }
        }
        if rate > 0 {
            parts.push((samples, rate));
        }
    }
    Ok(parts)
}

/// One chunk to speak: in `voice`, or with the Spoken Content voice and rate.
fn utterance(text: &str, voice: Option<&AVSpeechSynthesisVoice>) -> Retained<AVSpeechUtterance> {
    let utterance = unsafe { AVSpeechUtterance::speechUtteranceWithString(&NSString::from_str(text)) };
    match voice {
        Some(voice) => unsafe { utterance.setVoice(Some(voice)) },
        None => unsafe { utterance.setPrefersAssistiveTechnologySettings(true) },
    }
    utterance
}


