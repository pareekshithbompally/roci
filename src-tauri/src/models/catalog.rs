//! The curated models, every file pinned to a Hugging Face revision with its size and SHA-256.

use serde::Serialize;

use super::LocalError;

/// What a model is for, which decides the engine that runs it.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    /// Speech-to-text, run by transcribe.cpp.
    Speech,
    /// A read-aloud voice, run by llama.cpp; its first file is the model, the `mmproj` file its audio projector.
    Voice,
    /// Text embeddings for meeting search, run by llama.cpp; its first file is the model.
    Embedding,
    /// A chat model, run by llama.cpp; its first file is the model, then its projector and draft when it has them.
    Chat,
}

/// A Hugging Face repository at a pinned commit.
pub struct Source {
    pub repository: &'static str,
    pub revision: &'static str,
}

/// Nemotron 3.5 Bolt E4B's DFlash draft (speculative decoding), published beside the model.
static NEMOTRON_BOLT_DFLASH: Source = Source { repository: "nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB-DFlash", revision: "0949a2eb7152ec6fda1a91ff9302aecbcd464fbf" };


pub struct ModelFile {
    /// Path in its repository, and under the model's folder.
    pub name: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
    /// Where it comes from when not the model's own repository (a voice catalog).
    source: Option<&'static Source>,
}

pub struct LocalModel {
    pub id: &'static str,
    pub name: &'static str,
    /// The Hugging Face org that made the model (not who converted it): its logo marks the model in pickers.
    pub maker: &'static str,
    pub kind: Kind,
    /// Transcribes audio while it's still arriving (live dictation).
    pub streams: bool,
    source: Source,
    pub files: &'static [ModelFile],
    /// A voice model's speakers, the first its default; empty when it has one voice.
    pub voices: &'static [Voice],
    /// A speech model's longest audio per run (ms) when trained on clips shorter than it accepts; None: its own.
    pub max_run_ms: Option<usize>,
    /// The languages a speech model takes, as it spells them (the engine's catalog); empty for other kinds.
    pub languages: &'static [&'static str],
    /// A speech model can tell the language itself, so it runs without being told one.
    pub detects_language: bool,
}

/// A voice model's speaker: the name the model knows it by, and the name Roci shows.
pub struct Voice {
    pub id: &'static str,
    pub name: &'static str,
}

impl LocalModel {
    pub fn url(&self, file: &ModelFile) -> String {
        let source = self.source_of(file);
        format!("https://huggingface.co/{}/resolve/{}/{}", source.repository, source.revision, file.name)
    }

    /// The repository and revision `file` comes from: its own when it has one, else the model's.
    pub fn source_of<'a>(&'a self, file: &'a ModelFile) -> &'a Source {
        file.source.unwrap_or(&self.source)
    }

    pub fn bytes(&self) -> u64 {
        self.files.iter().map(|f| f.bytes).sum()
    }

    /// The file an engine loads (speech models are a single GGUF).
    pub fn main_file(&self) -> &'static ModelFile {
        &self.files[0]
    }
}

/// Picker order within each kind: the live-capable speech models first.
pub const MODELS: &[LocalModel] = &[
    LocalModel {
        id: "gemma-4-e4b",
        maker: "google",
        name: "Gemma 4 E4B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "ggml-org/gemma-4-E4B-it-GGUF", revision: "8903cb408c7df39cde2ed15fac397e6d7be92951" },
        files: &[
            ModelFile { name: "gemma-4-E4B-it-Q4_0.gguf", bytes: 4_590_807_392, sha256: "a555b900214b477d8880e7832e0b8925e139b0159640036b09fe472b6f2097f2", source: None },
            ModelFile { name: "mmproj-gemma-4-E4B-it-Q8_0.gguf", bytes: 559_874_848, sha256: "9257f21a0f5358204b4a612cff83fad2e56412f4f607f0049331ce60c0cf9d34", source: None },
            ModelFile { name: "mtp-gemma-4-E4B-it-Q4_0.gguf", bytes: 59_678_240, sha256: "d19a11e4fd5019967d9296f77f4d3e139c8903909f70c3a9cf009c9af4b9b88d", source: None },
        ],
    },
    LocalModel {
        id: "gemma-4-e2b",
        maker: "google",
        name: "Gemma 4 E2B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "ggml-org/gemma-4-E2B-it-GGUF", revision: "2a8538c2e2d4687953a86c422c7c623cfd022880" },
        files: &[
            ModelFile { name: "gemma-4-E2B-it-Q4_0.gguf", bytes: 2_841_481_184, sha256: "8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52", source: None },
            ModelFile { name: "mmproj-gemma-4-E2B-it-Q8_0.gguf", bytes: 557_368_096, sha256: "042cc2561806cd3b5cb5efb25cab76911e3100c43cc09d854904f921924b1429", source: None },
            ModelFile { name: "mtp-gemma-4-E2B-it-Q4_0.gguf", bytes: 59_235_872, sha256: "718d3a44057924d5840c65a0aeedf7929366adeeda92a2006955ccabaf645ef4", source: None },
        ],
    },
    LocalModel {
        id: "lfm3-omni-2b",
        maker: "LiquidAI",
        name: "LFM3 Omni 2B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "ggml-org/LFM3-Omni-2B-GGUF", revision: "7bfbae08baaede916f3157d91d40f45023a86c64" },
        files: &[
            ModelFile { name: "LFM3-Omni-2B-Q8_0.gguf", bytes: 1_846_240_736, sha256: "40d27b13e500963468f1fd1099863464a4a5e8f4682e934f9be8b54641b8c0c7", source: None },
            ModelFile { name: "mmproj-LFM3-Omni-2B-Q8_0.gguf", bytes: 506_842_432, sha256: "279fb3110acc6c20876016f92487006d95507fccb0699b0ef22ae19cc417c79e", source: None },
        ],
    },
    LocalModel {
        id: "nemotron-3.5-bolt-e4b",
        maker: "nvidia",
        name: "Nemotron 3.5 Bolt E4B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB", revision: "0e5d71fc20036486786f71befa103d23a97b79b1" },
        files: &[
            ModelFile { name: "Nemotron-3.5-Bolt-E4B-Q4_K_M.gguf", bytes: 6_180_446_208, sha256: "c8af2b8aea10a690a1d9491db744a9446660173cb38fc489612b556615a69612", source: None },
            ModelFile { name: "Nemotron-3.5-Bolt-E4B-mmproj-BF16.gguf", bytes: 991_551_840, sha256: "c63a6789192d19d8880b0a63c2d56cbda10a3e8f647ed3fd25deceb0bd00244b", source: None },
            ModelFile { name: "Nemotron-3.5-Bolt-E4B-DFlash-BF16.gguf", bytes: 736_812_096, sha256: "8103aa42fd31fb661c3fbe8701d04d698ea2c5d09351dc3e8c9da639958de989", source: Some(&NEMOTRON_BOLT_DFLASH) },
        ],
    },
    LocalModel {
        id: "qwen3-embedding-0.6b",
        maker: "Qwen",
        name: "Qwen3 Embedding 0.6B",
        kind: Kind::Embedding,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "Qwen/Qwen3-Embedding-0.6B-GGUF", revision: "370f27d7550e0def9b39c1f16d3fbaa13aa67728" },
        files: &[
            ModelFile { name: "Qwen3-Embedding-0.6B-Q8_0.gguf", bytes: 639_150_592, sha256: "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439", source: None },
        ],
    },

    LocalModel {
        id: "parakeet-unified-en",
        maker: "nvidia",
        name: "Parakeet",
        kind: Kind::Speech,
        streams: true,
        voices: &[],
        max_run_ms: None,
        languages: &["en"],
        detects_language: false,
        source: Source { repository: "handy-computer/parakeet-unified-en-0.6b-gguf", revision: "7e948f21b7bdbac698d3318db9d350f1096f3b6c" },
        files: &[ModelFile {
            name: "parakeet-unified-en-0.6b-Q8_0.gguf",
            bytes: 731_357_568,
            sha256: "4b50b6dd862bf6e346929aaf4f5eaacec003bfa3f56462d6c874b41ef2f38795",
            source: None,
        }],
    },
    LocalModel {
        id: "nemotron-3.5-asr",
        maker: "nvidia",
        name: "Nemotron",
        kind: Kind::Speech,
        streams: true,
        voices: &[],
        max_run_ms: None,
        languages: &["en-US", "en-GB", "es-US", "es-ES", "fr-FR", "fr-CA", "it-IT", "pt-BR", "pt-PT", "nl-NL", "de-DE", "tr-TR", "ru-RU", "ar-AR", "hi-IN", "ja-JP", "ko-KR", "vi-VN", "uk-UA", "pl-PL", "sv-SE", "cs-CZ", "nb-NO", "da-DK", "bg-BG", "fi-FI", "hr-HR", "sk-SK", "zh-CN", "hu-HU", "ro-RO", "et-EE"],
        detects_language: true,
        source: Source { repository: "handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf", revision: "53ce288f69326b415aeef030cfcb02a08a8096dd" },
        files: &[ModelFile {
            name: "nemotron-3.5-asr-streaming-0.6b-Q8_0.gguf",
            bytes: 751_094_240,
            sha256: "b94545b313b3223fda7b2857a52681da813935c2127643d1e9ff0c23d988089c",
            source: None,
        }],
    },
    LocalModel {
        id: "whisper-large-v3-turbo",
        maker: "openai",
        name: "Whisper Large Turbo",
        kind: Kind::Speech,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &["af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fo", "fr", "gl", "gu", "haw", "ha", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lb", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt", "ro", "ru", "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi", "yi", "yo", "yue", "zh"],
        detects_language: true,
        source: Source { repository: "handy-computer/whisper-large-v3-turbo-gguf", revision: "d222c9f621c1128299248f2ded4d8a1820519780" },
        files: &[ModelFile {
            name: "whisper-large-v3-turbo-Q8_0.gguf",
            bytes: 886_381_824,
            sha256: "d5e65f2b0828802ae2c231673d31982cebe3a778c95d9494a9f3efee6bd17448",
            source: None,
        }],
    },
    LocalModel {
        id: "whisper-small",
        maker: "openai",
        name: "Whisper Small",
        kind: Kind::Speech,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &["af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fo", "fr", "gl", "gu", "haw", "ha", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lb", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt", "ro", "ru", "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi", "yi", "yo", "zh"],
        detects_language: true,
        source: Source { repository: "handy-computer/whisper-small-gguf", revision: "4afdc7942ecf1997f359deae48a63506b062eac4" },
        files: &[ModelFile {
            name: "whisper-small-Q8_0.gguf",
            bytes: 269_751_136,
            sha256: "9b9c8811bbcc82a7766f0fb0925614bdacb0923b2cc630daeac17108b655b860",
            source: None,
        }],
    },
    LocalModel {
        id: "indic-transcribe-flex",
        maker: "bodhan-ai",
        name: "Indic Transcribe Flex",
        kind: Kind::Speech,
        streams: false,
        voices: &[],
        // Trained on clips of up to 30 s; its encoder would take 400 s, more than its decoder can write out.
        max_run_ms: Some(30_000),
        languages: &["as", "bgc", "bhb", "bho", "bn", "brx", "doi", "en", "gu", "hi", "hne", "kn", "kok", "ks", "mai", "ml", "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur"],
        detects_language: false,
        source: Source { repository: "paribompally/indic-transcribe-flex-gguf", revision: "63c619e5b16cca525294143a679a5a74b3c8f5b9" },
        files: &[ModelFile {
            name: "indic-transcribe-flex-Q8_0.gguf",
            bytes: 1_410_453_952,
            sha256: "1084edcfe3abc21c413ae956580d761f844baf4d687d385c94b09a54fe57e2ab",
            source: None,
        }],
    },
    LocalModel {
        id: "chatterbox-turbo",
        maker: "ResembleAI",
        name: "Chatterbox Turbo",
        kind: Kind::Voice,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "ggml-org/chatterbox-turbo-GGUF", revision: "66f0393558d0ac1e0337e23a4d15f26e8eca0e12" },
        files: &[
            ModelFile { name: "chatterbox-turbo-Q8_0.gguf", bytes: 481_791_712, sha256: "c3b93d3c65327ef5affbdf6c7975475782bb29bc70357c7e863e2d564cadf70f", source: None },
            ModelFile { name: "mmproj-chatterbox-turbo-F16.gguf", bytes: 555_371_392, sha256: "de86b2ead959ba7ffc487ac2ba278e99aed0ef3b5bd04f083352b36c9b86738f", source: None },
        ],
    },
    LocalModel {
        id: "soprano",
        maker: "ekwek",
        name: "Soprano 1.1",
        kind: Kind::Voice,
        streams: false,
        voices: &[],
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "ggml-org/Soprano-1.1-80M-GGUF", revision: "29f9f7b1871033ff9f35aa08cc6c44d2f324809a" },
        files: &[
            ModelFile { name: "Soprano-1.1-80M-Q8_0.gguf", bytes: 84_921_216, sha256: "749b45e4cfecdde096d15def0ad9311453dcaff2ad44685278281e1d0d48bb2a", source: None },
            ModelFile { name: "mmproj-Soprano-1.1-80M-F16.gguf", bytes: 60_821_216, sha256: "6ffe378cf5a89512bcd78d87f1b0bbcc95f76afdddaab44896bc11f144c08286", source: None },
        ],
    },

];



/// A curated model by id.
pub fn find(id: &str) -> Result<&'static LocalModel, LocalError> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| LocalError::UnknownModel(id.to_string()))
}

/// The embedding model search uses: the catalog's one embedding model.
pub fn search_embedder() -> Result<&'static LocalModel, LocalError> {
    MODELS.iter().find(|m| m.kind == Kind::Embedding).ok_or_else(|| LocalError::UnknownModel("embedding".into()))
}

/// A model that must be of `kind` (a speech engine never loads a voice).
pub fn find_kind(id: &str, kind: Kind) -> Result<&'static LocalModel, LocalError> {
    find(id).and_then(|m| if m.kind == kind { Ok(m) } else { Err(LocalError::UnknownModel(id.to_string())) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_model_is_found_only_as_its_kind() {
        assert!(find_kind("gemma-4-e4b", Kind::Chat).is_ok());
        assert!(find_kind("gemma-4-e4b", Kind::Speech).is_err());
        assert_eq!(search_embedder().unwrap().id, "qwen3-embedding-0.6b");
    }

    #[test]
    fn a_file_from_another_repository_downloads_from_it() {
        let model = find("nemotron-3.5-bolt-e4b").unwrap();
        let draft = model.files.iter().find(|f| f.name.contains("DFlash")).unwrap();
        assert!(model.url(draft).starts_with("https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB-DFlash/resolve/"));
        assert_eq!(model.main_file().name, "Nemotron-3.5-Bolt-E4B-Q4_K_M.gguf");
    }

    #[test]
    fn files_are_pinned_to_a_revision() {
        let model = find("whisper-large-v3-turbo").unwrap();
        assert_eq!(
            model.url(model.main_file()),
            "https://huggingface.co/handy-computer/whisper-large-v3-turbo-gguf/resolve/d222c9f621c1128299248f2ded4d8a1820519780/whisper-large-v3-turbo-Q8_0.gguf"
        );
        assert!(find("nope").is_err());
    }
}
