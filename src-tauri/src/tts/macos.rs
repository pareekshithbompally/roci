//! The macOS system voices, natively through AVFAudio: listed with
//! AVSpeechSynthesisVoice (name, quality, novelty flag) and spoken with
//! AVSpeechSynthesizer — every chunk queued as one utterance, so speech is
//! seamless, while a delegate reports each utterance starting, like Phonon's
//! chunks. AVFAudio calls the delegate on the main thread (the app's event
//! loop), so the speaking thread only waits on a channel. No voice chosen
//! follows System Settings › Accessibility › Spoken Content (voice and rate).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::Duration;

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_avf_audio::{
    AVSpeechBoundary, AVSpeechSynthesisVoice, AVSpeechSynthesisVoiceQuality, AVSpeechSynthesisVoiceTraits,
    AVSpeechSynthesizer, AVSpeechSynthesizerDelegate, AVSpeechUtterance,
};
use objc2_foundation::{NSObject, NSObjectProtocol, NSString};

use super::VoiceOption;
use crate::models::LocalError;

/// The first voice listed: the one set in Spoken Content (no voice passed to AVFAudio).
const SYSTEM_VOICE: &str = "system";

/// How long the speaking thread waits for progress before checking `stop`.
const POLL: Duration = Duration::from_millis(50);

/// The system voice, then the installed voices for `language` (e.g. `en`),
/// best quality first; novelty voices (Bells, Zarvox…) are left out. `id` is
/// the voice identifier.
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

/// What the synthesizer reports about the queued utterances, in order.
enum Progress {
    Started,
    Finished,
    Cancelled,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements; this class has no Drop.
    #[unsafe(super(NSObject))]
    #[name = "KassetSpeechProgress"]
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

/// Speaks `chunks` in order in voice `voice` (an identifier; None or the
/// system voice = Spoken Content's), calling `on_chunk` as each begins.
/// Returns when done, or as soon as `stop` is set.
pub fn speak(chunks: &[String], voice: Option<&str>, stop: &AtomicBool, mut on_chunk: impl FnMut(&str)) -> Result<(), LocalError> {
    let voice = voice.filter(|id| *id != SYSTEM_VOICE);
    let (events, inbox) = mpsc::channel();
    let progress = SpeechProgress::new(events);
    let synthesizer = unsafe { AVSpeechSynthesizer::new() };
    unsafe { synthesizer.setDelegate(Some(ProtocolObject::from_ref(&*progress))) };
    let voice = voice.and_then(|id| unsafe { AVSpeechSynthesisVoice::voiceWithIdentifier(&NSString::from_str(id)) });
    for chunk in chunks {
        unsafe { synthesizer.speakUtterance(&utterance(chunk, voice.as_deref())) };
    }

    let (mut started, mut finished) = (0, 0);
    while finished < chunks.len() {
        if stop.load(Ordering::Relaxed) {
            unsafe { synthesizer.stopSpeakingAtBoundary(AVSpeechBoundary::Immediate) };
            return Ok(());
        }
        match inbox.recv_timeout(POLL) {
            Ok(Progress::Started) => {
                if let Some(chunk) = chunks.get(started) {
                    on_chunk(chunk);
                }
                started += 1;
            }
            Ok(Progress::Finished) => finished += 1,
            Ok(Progress::Cancelled) | Err(RecvTimeoutError::Disconnected) => return Ok(()),
            Err(RecvTimeoutError::Timeout) => {}
        }
    }
    Ok(())
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


