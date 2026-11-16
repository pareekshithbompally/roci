//! Core Audio change listeners: the process list, each process's microphone use, and coreaudiod restarts.

use std::collections::HashSet;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::OnceLock;

use eyre::{Result, eyre};
use objc2_core_audio::{
    AudioObjectAddPropertyListener, AudioObjectID, AudioObjectPropertyAddress,
    AudioObjectPropertySelector, AudioObjectRemovePropertyListener,
    kAudioHardwarePropertyProcessObjectList, kAudioHardwarePropertyServiceRestarted,
    kAudioObjectSystemObject, kAudioProcessPropertyIsRunningInput,
};

use super::microphone::{process_objects, property_address};

/// What Core Audio reported.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum Change {
    /// A process started or stopped doing audio I/O.
    Processes,
    /// A process started or stopped using the microphone.
    Microphone,
    /// coreaudiod restarted: every process object is new.
    ServiceRestarted,
}

static NOTIFY: OnceLock<fn(Change)> = OnceLock::new();

const SYSTEM_OBJECT: AudioObjectID = kAudioObjectSystemObject as AudioObjectID;

/// Starts the system-wide listeners; `notify` runs on Core Audio's thread, so it should only hand the change on.
pub(super) fn listen(notify: fn(Change)) -> Result<()> {
    NOTIFY
        .set(notify)
        .map_err(|_| eyre!("Core Audio listeners already started"))?;
    add(SYSTEM_OBJECT, kAudioHardwarePropertyProcessObjectList)?;
    add(SYSTEM_OBJECT, kAudioHardwarePropertyServiceRestarted)
}

/// The processes whose microphone use is being listened to.
#[derive(Default)]
pub(super) struct Subscriptions {
    processes: HashSet<AudioObjectID>,
}

impl Subscriptions {
    /// Listens to every current process's microphone use and stops listening to the ones that quit.
    pub(super) fn sync(&mut self) {
        let current: HashSet<AudioObjectID> = match process_objects() {
            Ok(objects) => objects.into_iter().collect(),
            Err(error) => {
                log::warn!("[call-detection] could not list audio processes: {error}");
                return;
            }
        };
        for gone in self.processes.difference(&current) {
            // The object usually vanished with its process, so a failure here is expected.
            if let Err(error) = remove(*gone, kAudioProcessPropertyIsRunningInput) {
                log::debug!("[call-detection] {error}");
            }
        }
        self.processes.retain(|object| current.contains(object));
        for object in current {
            if self.processes.contains(&object) {
                continue;
            }
            match add(object, kAudioProcessPropertyIsRunningInput) {
                Ok(()) => {
                    self.processes.insert(object);
                }
                Err(error) => log::debug!("[call-detection] {error}"),
            }
        }
    }

    /// coreaudiod restarted: the old process objects are gone, so subscribe afresh.
    pub(super) fn reset(&mut self) {
        self.processes.clear();
        self.sync();
    }
}

/// Each subscribed property and the change it reports.
const CHANGES: [(AudioObjectPropertySelector, Change); 3] = [
    (kAudioHardwarePropertyProcessObjectList, Change::Processes),
    (kAudioProcessPropertyIsRunningInput, Change::Microphone),
    (kAudioHardwarePropertyServiceRestarted, Change::ServiceRestarted),
];

fn change_for(selector: AudioObjectPropertySelector) -> Option<Change> {
    CHANGES
        .iter()
        .find_map(|&(known, change)| (known == selector).then_some(change))
}

/// The one listener proc for every subscription, so add and remove pass the same pointer.
unsafe extern "C-unwind" fn on_property(
    _object: AudioObjectID,
    count: u32,
    addresses: NonNull<AudioObjectPropertyAddress>,
    _client_data: *mut c_void,
) -> i32 {
    let Some(notify) = NOTIFY.get() else { return 0 };
    // SAFETY: Core Audio passes `count` addresses at `addresses`.
    let addresses = unsafe { std::slice::from_raw_parts(addresses.as_ptr(), count as usize) };
    addresses
        .iter()
        .filter_map(|address| change_for(address.mSelector))
        .for_each(notify);
    0
}

fn add(object: AudioObjectID, selector: AudioObjectPropertySelector) -> Result<()> {
    let mut address = property_address(selector);
    // SAFETY: `address` outlives the call; `on_property` matches the listener signature.
    let status = unsafe {
        AudioObjectAddPropertyListener(
            object,
            NonNull::from(&mut address),
            Some(on_property),
            std::ptr::null_mut(),
        )
    };
    match status {
        0 => Ok(()),
        _ => Err(eyre!("listening to {selector:#x} on {object} failed with status {status}")),
    }
}

fn remove(object: AudioObjectID, selector: AudioObjectPropertySelector) -> Result<()> {
    let mut address = property_address(selector);
    // SAFETY: the same object, address and proc that `add` registered.
    let status = unsafe {
        AudioObjectRemovePropertyListener(
            object,
            NonNull::from(&mut address),
            Some(on_property),
            std::ptr::null_mut(),
        )
    };
    match status {
        0 => Ok(()),
        _ => Err(eyre!("unlistening {selector:#x} on {object} failed with status {status}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selectors_map_to_their_change() {
        assert_eq!(change_for(kAudioHardwarePropertyProcessObjectList), Some(Change::Processes));
        assert_eq!(change_for(kAudioProcessPropertyIsRunningInput), Some(Change::Microphone));
        assert_eq!(change_for(kAudioHardwarePropertyServiceRestarted), Some(Change::ServiceRestarted));
        assert_eq!(change_for(0), None);
    }
}
