use serde::{Deserialize, Serialize};

/// Why Apple Intelligence can or can't run.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Availability {
    Available,
    DeviceNotEligible,
    AppleIntelligenceOff,
    ModelNotReady,
    Unknown,
}

impl Availability {
    pub fn from_code(code: i32) -> Self {
        match code {
            0 => Self::Available,
            1 => Self::DeviceNotEligible,
            2 => Self::AppleIntelligenceOff,
            3 => Self::ModelNotReady,
            _ => Self::Unknown,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ModelStatus {
    pub availability: Availability,
    /// Context window in tokens; 0 when unavailable.
    pub context_tokens: usize,
}

/// Errors the webview maps to user-facing copy, serialized as `{ code, detail? }`.
#[derive(Debug, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "kebab-case")]
pub enum AppleError {
    /// The prompt didn't fit; retry once with a shorter excerpt.
    ContextWindow,
    /// Apple's guardrails declined the content.
    Refused,
    Unavailable(String),
    Timeout,
    /// Speech Recognition is off for Roci.
    NotAuthorized,
    /// The language's speech model isn't downloaded.
    ModelNotReady,
    UnsupportedLanguage,
    Failed(String),
}

/// `{"error": {"kind", "message"}}` from a Swift bridge.
#[derive(Deserialize)]
pub struct BridgeFailure {
    pub kind: String,
    pub message: String,
}

impl From<BridgeFailure> for AppleError {
    fn from(failure: BridgeFailure) -> Self {
        match failure.kind.as_str() {
            "context-window" => Self::ContextWindow,
            "refused" => Self::Refused,
            "unavailable" => Self::Unavailable(failure.message),
            "timeout" => Self::Timeout,
            "not-authorized" => Self::NotAuthorized,
            "model-not-ready" => Self::ModelNotReady,
            "unsupported-language" => Self::UnsupportedLanguage,
            _ => Self::Failed(failure.message),
        }
    }
}

/// A bridge reply: the value, or a tagged failure.
#[derive(Deserialize)]
pub struct Reply<T> {
    #[serde(flatten)]
    pub value: Option<T>,
    pub error: Option<BridgeFailure>,
}

/// One message of a streamed chat reply: a text piece, then `finish` once it's complete.
#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "kebab-case")]
pub enum StreamEvent {
    Delta(String),
    Finish,
}

/// `{"text"}`: a generation, or a live speech stream's final transcript.
#[derive(Deserialize)]
pub struct Text {
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpeechStatus {
    pub available: bool,
    /// authorized · denied · not_determined · restricted
    pub authorization: String,
    /// The language's model is downloaded.
    pub installed: bool,
    /// The languages Apple speech transcribes on this device (BCP 47).
    pub languages: Vec<String>,
}

#[derive(Deserialize)]
pub struct Granted {
    pub granted: bool,
}

/// One recognized span, in seconds.
#[derive(Debug, Serialize, Deserialize)]
pub struct SpeechSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

/// Timed segments, and words when the analyzer gives them (the same shape as Roci's own engine).
#[derive(Serialize, Deserialize)]
pub struct Transcription {
    pub segments: Vec<SpeechSegment>,
    #[serde(default)]
    pub words: Vec<SpeechSegment>,
}

/// A live speech stream's text so far: the settled words, then the ones still being revised.
#[derive(Serialize, Deserialize)]
pub struct LiveText {
    pub committed: String,
    pub tentative: String,
}

#[derive(Deserialize)]
pub struct Empty {}
