//! System voices via AVFAudio (Mac, iPhone, iPad); the delegate fires on the main thread, so speaking waits on a channel.

use std::sync::mpsc::{self, Sender};

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, AllocAnyThread, DefinedClass};
use objc2_avf_audio::{
    AVSpeechBoundary, AVSpeechSynthesisVoice, AVSpeechSynthesisVoiceQuality, AVSpeechSynthesisVoiceTraits,
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

/// One chunk to speak: in `voice`, or with the Spoken Content voice and rate.
fn utterance(text: &str, voice: Option<&AVSpeechSynthesisVoice>) -> Retained<AVSpeechUtterance> {
    let utterance = unsafe { AVSpeechUtterance::speechUtteranceWithString(&NSString::from_str(text)) };
    match voice {
        Some(voice) => unsafe { utterance.setVoice(Some(voice)) },
        None => unsafe { utterance.setPrefersAssistiveTechnologySettings(true) },
    }
    utterance
}


