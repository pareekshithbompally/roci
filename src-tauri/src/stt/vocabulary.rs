//! The custom vocabulary as speech recognition reads it (Settings › Personalization › Vocabulary): Parakeet biases its
//! transcript toward the terms, Whisper reads them as its context prompt. The webview sets it at launch and on every change;
//! each run reads it as it starts, so a change applies from the next one.

use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;

use serde::Deserialize;
use transcribe_cpp::{ExtSlot, Feature, Model, ParakeetVocabularyOptions, RunExtension, RunOptions, Transcript};

use crate::sync::lock;

/// Most terms one run is biased toward, first in list order: the engine's own cap (`k_vocab_max_terms` in transcribe.cpp).
const MAX_BIASED_TERMS: usize = 64;

/// A term and the spellings a transcript may show instead of it.
#[derive(Clone, Debug, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyEntry {
    pub term: String,
    #[serde(default)]
    pub sounds_like: Vec<String>,
}

/// How readily recognition swaps heard words for a term that sounds like them.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecognitionBoost {
    /// Transcripts are left as the model heard them.
    Off,
    Light,
    #[default]
    Normal,
    Strong,
}

impl RecognitionBoost {
    const ALL: [Self; 4] = [Self::Off, Self::Light, Self::Normal, Self::Strong];

    /// How much less likely than the heard words, in nats per term piece, a term may score and still replace them.
    fn nats(self) -> f32 {
        match self {
            Self::Off => 0.0,
            Self::Light => 2.0,
            Self::Normal => 2.5,
            Self::Strong => 4.0,
        }
    }

    fn from_index(index: u8) -> Self {
        Self::ALL.get(usize::from(index)).copied().unwrap_or_default()
    }
}

static SAVED: Mutex<Vec<VocabularyEntry>> = Mutex::new(Vec::new());
static BOOST: AtomicU8 = AtomicU8::new(RecognitionBoost::Normal as u8);

/// The vocabulary and boost runs read from now on.
pub fn apply(entries: Vec<VocabularyEntry>, boost: RecognitionBoost) {
    *lock(&SAVED) = entries;
    BOOST.store(boost as u8, Ordering::Relaxed);
}

/// How a loaded model takes the vocabulary.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VocabularySlot {
    /// Parakeet's transducer rescoring, as a run extension.
    Bias,
    /// The context prompt (Whisper, Qwen3-ASR), bounded to this many characters.
    Prompt(usize),
    None,
}

impl VocabularySlot {
    pub fn of(model: &Model) -> Self {
        let architecture = model.arch();
        if architecture == "parakeet"
            && model.accepts_ext(ExtSlot::Run, transcribe_cpp::sys::TRANSCRIBE_EXT_KIND_PARAKEET_VOCABULARY)
        {
            return Self::Bias;
        }
        if !model.supports(Feature::ContextPrompt) {
            return Self::None;
        }
        prompt_chars(&architecture).map_or(Self::None, Self::Prompt)
    }

    /// `options` with the saved vocabulary added; none while the boost is Off. Streams take only the bias: a prompt is for
    /// whole-clip runs.
    pub fn apply(self, options: RunOptions, stream: bool) -> RunOptions {
        if boost() == RecognitionBoost::Off {
            return options;
        }
        match self {
            Self::Bias => match transcription_bias() {
                Some((terms, bias)) => RunOptions { vocabulary: terms, family: Some(RunExtension::ParakeetVocabulary(bias)), ..options },
                None => options,
            },
            Self::Prompt(max_chars) if !stream => RunOptions { prompt: prompt_for(&lock(&SAVED), max_chars), ..options },
            _ => options,
        }
    }
}

/// The recognition boost as set now.
fn boost() -> RecognitionBoost {
    RecognitionBoost::from_index(BOOST.load(Ordering::Relaxed))
}

/// The terms and options a Parakeet run biases toward; None while the list is empty.
fn transcription_bias() -> Option<(Vec<String>, ParakeetVocabularyOptions)> {
    bias_for(&lock(&SAVED), boost())
}

fn bias_for(entries: &[VocabularyEntry], boost: RecognitionBoost) -> Option<(Vec<String>, ParakeetVocabularyOptions)> {
    let entries = &entries[..entries.len().min(MAX_BIASED_TERMS)];
    if entries.is_empty() {
        return None;
    }
    let sounds_like = entries
        .iter()
        .enumerate()
        .flat_map(|(index, entry)| entry.sounds_like.iter().map(move |spelling| (index, spelling.clone())))
        .collect();
    Some((
        entries.iter().map(|entry| entry.term.clone()).collect(),
        ParakeetVocabularyOptions { boost: Some(boost.nats()), sounds_like },
    ))
}

/// How much of the vocabulary a context prompt carries, in characters; None for an architecture without one. Whisper's
/// prompt slot holds 223 tokens and its engine trims an overlong one from the front (the most important terms), so the
/// list stays well inside it; Qwen3-ASR's bound keeps a long list from crowding out the audio or being echoed.
fn prompt_chars(architecture: &str) -> Option<usize> {
    match architecture {
        "whisper" => Some(500),
        "qwen3_asr" => Some(1_000),
        _ => None,
    }
}

/// The first terms in list order that fit `max_chars`, comma-separated so `drop_prompt_echo` can recognise the list.
fn prompt_for(entries: &[VocabularyEntry], max_chars: usize) -> Option<String> {
    let terms = &entries[..prompt_terms(entries, max_chars)];
    (!terms.is_empty()).then(|| terms.iter().map(|entry| entry.term.as_str()).collect::<Vec<_>>().join(", "))
}

/// How many of the first terms fit `max_chars` joined by ", ".
fn prompt_terms(entries: &[VocabularyEntry], max_chars: usize) -> usize {
    let mut chars = 0;
    for (index, entry) in entries.iter().enumerate() {
        let separator = if index == 0 { 0 } else { 2 };
        chars += separator + entry.term.chars().count();
        if chars > max_chars {
            return index;
        }
    }
    entries.len()
}

/// Lowercased words without edge punctuation, digits spelled as numerals: how an echo of the prompt is recognised.
fn normalize_spoken(text: &str) -> String {
    const DIGITS: [&str; 10] = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
    text.split_whitespace()
        .filter_map(|word| {
            let word = word.trim_matches(|character: char| character.is_ascii_punctuation()).to_ascii_lowercase();
            if word.is_empty() {
                return None;
            }
            Some(DIGITS.iter().position(|digit| *digit == word).map_or(word, |n| n.to_string()))
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Removes segments that only read the prompt's term list back (a decoder given silence and a list of two or more terms
/// may echo it), with their words; speech that merely contains a term is kept.
pub fn drop_prompt_echo(transcript: &mut Transcript, prompt: &str) {
    let is_separator = |character: char| matches!(character, ',' | ';' | '\n');
    if prompt.split(is_separator).filter(|hint| !hint.trim().is_empty()).count() < 2 {
        return;
    }
    let normalize = |text: &str| normalize_spoken(&text.replace(is_separator, " "));
    let prompt = normalize(prompt);
    let echoes = |text: &str| normalize(text) == prompt;
    if transcript.segments.is_empty() {
        if echoes(&transcript.text) {
            transcript.text.clear();
            transcript.words.clear();
        }
        return;
    }
    if !transcript.segments.iter().any(|segment| echoes(&segment.text)) {
        return;
    }
    let words = std::mem::take(&mut transcript.words);
    let mut segments = Vec::new();
    for mut segment in std::mem::take(&mut transcript.segments) {
        if echoes(&segment.text) {
            continue;
        }
        let first = (segment.first_word.max(0) as usize).min(words.len());
        let last = (first + segment.n_words.max(0) as usize).min(words.len());
        segment.first_word = transcript.words.len() as i32;
        let index = segments.len() as i32;
        transcript.words.extend(words[first..last].iter().cloned().map(|mut word| {
            word.seg_index = index;
            word
        }));
        segments.push(segment);
    }
    transcript.text = segments.iter().map(|segment| segment.text.trim()).filter(|text| !text.is_empty()).collect::<Vec<_>>().join(" ");
    transcript.segments = segments;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(term: &str, sounds_like: &[&str]) -> VocabularyEntry {
        VocabularyEntry { term: term.into(), sounds_like: sounds_like.iter().map(|s| (*s).into()).collect() }
    }

    fn transcript(segments: &[&str]) -> Transcript {
        let mut transcript = Transcript::default();
        let mut first_word = 0;
        for text in segments {
            let n_words = text.split_whitespace().count() as i32;
            transcript.segments.push(transcribe_cpp::Segment { text: (*text).into(), first_word, n_words, ..Default::default() });
            for word in text.split_whitespace() {
                transcript.words.push(transcribe_cpp::Word { text: word.into(), ..Default::default() });
            }
            first_word += n_words;
        }
        transcript.text = segments.join(" ");
        transcript
    }

    fn words(transcript: &Transcript) -> Vec<&str> {
        transcript.words.iter().map(|word| word.text.as_str()).collect()
    }

    #[test]
    fn the_webviews_entries_and_boost_deserialize() {
        let entries: Vec<VocabularyEntry> = serde_json::from_str(r#"[{"term":"Context7","soundsLike":["contact7"]},{"term":"Rune"}]"#).unwrap();
        assert_eq!(entries, [entry("Context7", &["contact7"]), entry("Rune", &[])]);
        assert_eq!(serde_json::from_str::<RecognitionBoost>(r#""strong""#).unwrap(), RecognitionBoost::Strong);
    }

    #[test]
    fn bias_keeps_the_first_terms_and_their_spellings() {
        assert!(bias_for(&[], RecognitionBoost::Normal).is_none());
        let mut list = vec![entry("Cappuccino", &["capuchin", "cap a chino"]), entry("Rune", &[])];
        list.extend((0..70).map(|index| entry(&format!("term {index}"), &["x"])));
        let (terms, options) = bias_for(&list, RecognitionBoost::Strong).unwrap();
        assert_eq!(terms.len(), MAX_BIASED_TERMS);
        assert_eq!(terms[..2], ["Cappuccino", "Rune"]);
        assert_eq!(options.boost, Some(4.0));
        assert_eq!(options.sounds_like[..2], [(0, "capuchin".into()), (0, "cap a chino".into())]);
        assert_eq!(options.sounds_like[2], (2, "x".into()));
        assert!(options.sounds_like.iter().all(|(index, _)| *index < MAX_BIASED_TERMS));
    }

    #[test]
    fn the_prompt_keeps_the_first_terms_that_fit() {
        let list = vec![entry("Kaffar", &["Caffer"]), entry("Rodolfo", &[]), entry("Bragelonne", &[])];
        assert_eq!(prompt_for(&list, 100).as_deref(), Some("Kaffar, Rodolfo, Bragelonne"));
        assert_eq!(prompt_for(&list, 20).as_deref(), Some("Kaffar, Rodolfo"));
        assert_eq!(prompt_for(&list, 3), None);
        assert_eq!(prompt_for(&[], 100), None);
        let many: Vec<_> = (0..100).map(|n| entry(&format!("T{n}"), &[])).collect();
        assert_eq!(prompt_for(&many, 10_000).unwrap().split(", ").count(), 100);
        assert!(prompt_for(&many, 1_000).unwrap().chars().count() <= 1_000);
    }

    #[test]
    fn prompt_echo_is_dropped() {
        let mut echo = transcript(&["T3 Code, Ottobit."]);
        drop_prompt_echo(&mut echo, "t3 code, ottobit");
        assert_eq!(echo.text, "");
        assert!(echo.segments.is_empty() && echo.words.is_empty());

        let mut unsegmented = Transcript { text: " T3 Code, Ottobit. ".into(), ..Default::default() };
        drop_prompt_echo(&mut unsegmented, "T3 Code, Ottobit");
        assert_eq!(unsegmented.text, "");
    }

    #[test]
    fn speech_containing_the_terms_is_kept() {
        let mut speech = transcript(&["We shipped T3 Code today"]);
        let before = speech.clone();
        drop_prompt_echo(&mut speech, "T3 Code");
        assert_eq!(speech, before);

        let mut single = transcript(&["Ottobit."]);
        let before = single.clone();
        drop_prompt_echo(&mut single, "Ottobit");
        assert_eq!(single, before);
    }

    #[test]
    fn only_the_echo_segment_is_removed() {
        let mut leading = transcript(&["T3 Code, Ottobit.", "Let's ship it."]);
        drop_prompt_echo(&mut leading, "T3 Code,Ottobit");
        assert_eq!(leading.text, "Let's ship it.");
        assert_eq!(words(&leading), ["Let's", "ship", "it."]);
        assert_eq!((leading.segments[0].first_word, leading.segments[0].n_words), (0, 3));
    }
}
