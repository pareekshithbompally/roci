//! The curated models, every file pinned to a Hugging Face revision with its size and SHA-256.

use serde::Serialize;

use super::LocalError;

/// What a model is for, which decides the engine that runs it.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    /// Speech-to-text, run by transcribe.cpp.
    Speech,
    /// A read-aloud voice, run by MLX (RociMLX); files are the model's folder.
    Voice,
    /// Text embeddings for meeting search, run by MLX (RociMLX); files are the model's folder.
    Embedding,
    /// A chat model, run by MLX (RociMLX); files are the model's folder.
    Chat,
}

/// A Hugging Face repository at a pinned commit.
pub struct Source {
    repository: &'static str,
    revision: &'static str,
}

/// Phonon's voice catalog (Gradium): its voices download beside the model.
static PHONON_VOICES: Source = Source { repository: "gradium/phonon-voices", revision: "0ee17205f254b5abc43b266c8a0f215565c352f7" };

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
    /// The audio package's model type when the model's config.json names none it knows; None: its config decides.
    pub loads_as: Option<&'static str>,
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
        let source = file.source.unwrap_or(&self.source);
        format!("https://huggingface.co/{}/resolve/{}/{}", source.repository, source.revision, file.name)
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
        id: "qwen3.5-9b",
        maker: "Qwen",
        name: "Qwen3.5 9B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        loads_as: None,
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "mlx-community/Qwen3.5-9B-4bit", revision: "8b2b98c00a6b4d291155e4890773ca8f769aee53" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 7_756, sha256: "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715", source: None },
            ModelFile { name: "config.json", bytes: 3_331, sha256: "a96942cb6a8a1d3f1d17514d81a1925d04362a6a3233b389d13012211baaa9f8", source: None },
            ModelFile { name: "model-00001-of-00002.safetensors", bytes: 5_349_771_222, sha256: "a68b87558c6ef43f74c2bd63ce7e9092ceddc3101f3def0030774bae5f42aadd", source: None },
            ModelFile { name: "model-00002-of-00002.safetensors", bytes: 600_449_850, sha256: "b0a770bf8469c7f3f18756a0e0283f1c1174344a83e059a4e483f6af4907352d", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 123_592, sha256: "dd023913fb87cfdae27fb11dcf695117c925833796ccac3c64117d6652d8ff1e", source: None },
            ModelFile { name: "preprocessor_config.json", bytes: 390, sha256: "27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516", source: None },
            ModelFile { name: "processor_config.json", bytes: 1_300, sha256: "14932921ca485d458a04dafd8069fbb0a4505622a48208d19ed247115801385b", source: None },
            ModelFile { name: "tokenizer.json", bytes: 19_989_343, sha256: "87a7830d63fcf43bf241c3c5242e96e62dd3fdc29224ca26fed8ea333db72de4", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 1_139, sha256: "e98f1901ac6f0adff67b1d540bfa0c36ac1a0cf59eb72ed78146ef89aafa1182", source: None },
            ModelFile { name: "video_preprocessor_config.json", bytes: 385, sha256: "7768af27c1fafa9cc9011c1dc20067e03f8915e03b63504550e11d5066986d13", source: None },
            ModelFile { name: "vocab.json", bytes: 6_722_759, sha256: "ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003", source: None },
        ],
    },
    LocalModel {
        id: "minicpm5-2b",
        maker: "openbmb",
        name: "MiniCPM5 2B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        loads_as: None,
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "openbmb/MiniCPM5-2B-MLX", revision: "c8c072dbfbc5ce9c8faf3fbff9665b86fdc29c62" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 9_060, sha256: "cc945752db555d60949b16989df4ccfeb52a313d6b4b5c5229dd786e2e9fcf1c", source: None },
            ModelFile { name: "config.json", bytes: 886, sha256: "deb9ca33e863cbc84a9ab7209cd924fc05505dc33270c807d47f1b78fbd53a50", source: None },
            ModelFile { name: "generation_config.json", bytes: 213, sha256: "9ac4f32e5f32358697a9f438a3ea89ef80e6ba786c72c49e932f9f21c122fdb1", source: None },
            ModelFile { name: "model.safetensors", bytes: 1_416_035_216, sha256: "c207798696a4a454e7ac211b25227625466c693335941cee8904fb922f295cc1", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 68_721, sha256: "ccf202e0a06fe3c7eb8f354cfb29412a5e64956ad895413d4d9267ae4b3a6045", source: None },
            ModelFile { name: "tokenizer.json", bytes: 9_894_271, sha256: "3e065a558a034185fe299917b398685c1facd0169a9eea1e629eb30c171fed81", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 435, sha256: "b89503c3e5070c6b6d33daf2e20cb4a5c88537c1670d9b7e0cfb4506a61448a9", source: None },
        ],
    },
    LocalModel {
        id: "granite-4.2-3b",
        maker: "ibm-granite",
        name: "Granite 4.2 3B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        loads_as: None,
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "ibm-granite/granite-4.2-3b-q4-mlx", revision: "0c6f39b1827afd5eb2c1c3b13751929857434953" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 9_013, sha256: "f0ba43f79b3cabca5e5a7584c77aec92f49feae45cdf7779c87d9fc54cd90258", source: None },
            ModelFile { name: "config.json", bytes: 1_185, sha256: "bfcb1a01587dae223af89f07b960f0b456ef9fe9576167a126aa807941b213d7", source: None },
            ModelFile { name: "generation_config.json", bytes: 207, sha256: "1b9baf0a7959d31d7fb58ff6b506c27d09a73d395cadccc7e6dd1d4b7e43fd9d", source: None },
            ModelFile { name: "model.safetensors", bytes: 2_059_005_430, sha256: "a71cf9297827b3c3d6ad426081b67c423044f6576632dabe40e7590552fd267d", source: None },
            ModelFile { name: "tokenizer.json", bytes: 7_153_414, sha256: "883975314d58743726347caaf2c32ac89afd5ad57222cffbc4f052f2ab27b2d7", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 436, sha256: "0b1cc678b9fbde8ce90c81e0f6483c4e1696dfa377330e42a88106416b96e659", source: None },
        ],
    },
    LocalModel {
        id: "ternary-bonsai-2-4b",
        maker: "prism-ml",
        name: "Ternary Bonsai 2 4B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        loads_as: None,
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "prism-ml/Ternary-Bonsai-2-4B-mlx-2bit", revision: "dff2caaa23fa8706164c44c10f1b58feb405f76a" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 7_756, sha256: "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715", source: None },
            ModelFile { name: "config.json", bytes: 29_911, sha256: "119ae9e731281a52b8a590edc6971a6f95c8b283cd6bb215f12b1f172e587b23", source: None },
            ModelFile { name: "generation_config.json", bytes: 201, sha256: "a3345cadb9d63a91a11c2c12135da7eadc3d0c820e3287b04682b51cad1b12d2", source: None },
            ModelFile { name: "model.safetensors", bytes: 1_871_365_704, sha256: "432f48d0edcb8da2e6a4e0c96078588362397e2603e7fdea99957babfe968259", source: None },
            ModelFile { name: "preprocessor_config.json", bytes: 390, sha256: "27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516", source: None },
            ModelFile { name: "tokenizer.json", bytes: 12_807_982, sha256: "5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 16_710, sha256: "316230d6a809701f4db5ea8f8fc862bc3a6f3229c937c174e674ff3ca0a64ac8", source: None },
        ],
    },
    LocalModel {
        id: "qwen3-embedding-0.6b",
        maker: "Qwen",
        name: "Qwen3 Embedding",
        kind: Kind::Embedding,
        streams: false,
        voices: &[],
        loads_as: None,
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "mlx-community/Qwen3-Embedding-0.6B-8bit", revision: "407ad2329cd30702720aafe83f74a1ba30fdfbca" },
        files: &[
            ModelFile { name: "added_tokens.json", bytes: 707, sha256: "c0284b582e14987fbd3d5a2cb2bd139084371ed9acbae488829a1c900833c680", source: None },
            ModelFile { name: "chat_template.jinja", bytes: 4_116, sha256: "87a2728cb8dc9fe424d624542f6060ec05a1d285ebbec578bb078900e33396b5", source: None },
            ModelFile { name: "config.json", bytes: 857, sha256: "65fb46306262bac47c6a89e5ad8a766c3d40d559057c1931e9c10976266a4fc7", source: None },
            ModelFile { name: "config_sentence_transformers.json", bytes: 215, sha256: "10667c72ddb772627bf1780cb7f86af8e2ae0032b8c243c731172064105c6961", source: None },
            ModelFile { name: "generation_config.json", bytes: 117, sha256: "28396d421a2108acce96383f6a7de78008f7f1b17f807958f3c14c51dbfb65fb", source: None },
            ModelFile { name: "merges.txt", bytes: 1_671_853, sha256: "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5", source: None },
            ModelFile { name: "model.safetensors", bytes: 633_152_041, sha256: "fe956e8d346b4f08215a3cfc48a874354f900c20a59e965b75df0d9d77c54b28", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 49_731, sha256: "d387721e7d2dd44152b7dc9fcea8d5647e2692e1c064949c000fabad3292d1d1", source: None },
            ModelFile { name: "modules.json", bytes: 349, sha256: "84e40c8e006c9b1d6c122e02cba9b02458120b5fb0c87b746c41e0207cf642cf", source: None },
            ModelFile { name: "special_tokens_map.json", bytes: 613, sha256: "76862e765266b85aa9459767e33cbaf13970f327a0e88d1c65846c2ddd3a1ecd", source: None },
            ModelFile { name: "tokenizer.json", bytes: 11_423_705, sha256: "def76fb086971c7867b829c23a26261e38d9d74e02139253b38aeb9df8b4b50a", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 5_404, sha256: "443bfa629eb16387a12edbf92a76f6a6f10b2af3b53d87ba1550adfcf45f7fa0", source: None },
            ModelFile { name: "vocab.json", bytes: 2_776_833, sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910", source: None },
        ],
    },
    LocalModel {
        id: "parakeet-unified-en",
        maker: "nvidia",
        name: "Parakeet",
        kind: Kind::Speech,
        streams: true,
        voices: &[],
        loads_as: None,
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
        loads_as: None,
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
        loads_as: None,
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
        loads_as: None,
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
        id: "cohere-transcribe",
        maker: "CohereLabs",
        name: "Cohere Transcribe",
        kind: Kind::Speech,
        streams: false,
        voices: &[],
        loads_as: None,
        max_run_ms: None,
        languages: &["en", "fr", "de", "es", "it", "pt", "nl", "pl", "el", "ar", "ja", "zh", "vi", "ko"],
        detects_language: false,
        source: Source { repository: "handy-computer/cohere-transcribe-03-2026-gguf", revision: "dfa4adebb64f3076b7b6b90b721275cc069cb421" },
        files: &[ModelFile {
            name: "cohere-transcribe-03-2026-Q8_0.gguf",
            bytes: 2_410_655_232,
            sha256: "931916663432fd895423a4291a8400221802b288967ca2d435fc5e3141c9e71e",
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
        loads_as: None,
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
        id: "phonon",
        maker: "gradium",
        name: "Phonon",
        kind: Kind::Voice,
        streams: false,
        // A voice's id is its file's name in `voices/`, as the model reads it (lowercased); US then UK, four each.
        voices: &[
            Voice { id: "nbpkqmvs3cjeq2j8", name: "Zoey" },
            Voice { id: "niwiov5vti5ermj8", name: "Juniper" },
            Voice { id: "4szhfmpw-p46ywgs", name: "Harper" },
            Voice { id: "lmdiye0oa377qh6z", name: "Easton" },
            Voice { id: "40qrmvgaxfiunp9f", name: "Micah" },
            Voice { id: "0zlapszfvllnaegl", name: "Trevor" },
            Voice { id: "6pwnv0nq4wu7rvbt", name: "Maeve" },
            Voice { id: "x6nceqf285gr04gb", name: "Alfie" },
        ],
        loads_as: Some("phonon"),
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "gradium/phonon-31m-en", revision: "8f7a37c94a4c58b04c8287300c53f11d2e208eae" },
        files: &[
            ModelFile { name: "config.json", bytes: 4_634, sha256: "b5d0f88353638370d94035b7d73d7d6577c0554d78f8d7ecfd40490aae39ae85", source: None },
            ModelFile { name: "model.safetensors", bytes: 102_823_920, sha256: "8a04cf833cfe69b67c2ec968b2d31244655b9accc84ade9c0ebcc176f2074607", source: None },
            ModelFile { name: "tokenizer.model", bytes: 65_045, sha256: "82e4572006d64d483317074c22c368e87779640b6f3a9dcd07b7caae32b030ce", source: None },
            ModelFile { name: "voices/NbpkqMVS3CJeq2j8.safetensors", bytes: 256_136, sha256: "97c7f8c253413574406ab80dd23f49c3ebb2517163b00a9bf86b9c4cf43e7e23", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/NIWIOv5vTi5eRMj8.safetensors", bytes: 256_136, sha256: "444378eb06b7c492b86e8fc7d13e4db1a3c0cf3e68891a960bf6f0a41a13ef35", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/4SZHfMpw-p46Ywgs.safetensors", bytes: 256_136, sha256: "6b3da6e2d796a20c51af892c482bd6509fb88267a221aff83c870843dee2a123", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/LMDIYE0Oa377Qh6Z.safetensors", bytes: 256_136, sha256: "45c582673cb20edb04ddcca2b5a8865ddfb0a82599efadb269021e87d20fbdd4", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/40QrMVgAxFiUnP9f.safetensors", bytes: 256_136, sha256: "0de1098d1051686a138d068e83ff09deb5053328bc74ec9541a1fdb90bfc24da", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/0zLApsZfVLLNaEGl.safetensors", bytes: 256_136, sha256: "dc1341c8937af5534e6bbcc5c0fc5e7c10312229b59061228074f93683fe2261", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/6PWnV0Nq4wu7RVBT.safetensors", bytes: 256_136, sha256: "56494ee67d533ad227ff0dfd0b1c13ff5aa91f1ad6e596e66c2986ba3005e844", source: Some(&PHONON_VOICES) },
            ModelFile { name: "voices/X6NceqF285Gr04gb.safetensors", bytes: 256_136, sha256: "4de75497fff3030168e8aa6dca23ffeb332b1bc8c25d0bf3507ceadac953ae9c", source: Some(&PHONON_VOICES) },
        ],
    },
    LocalModel {
        id: "ming-tts",
        maker: "inclusionAI",
        name: "Ming 3.0 TTS",
        kind: Kind::Voice,
        streams: false,
        voices: &[
            Voice { id: "US_James", name: "James" },
            Voice { id: "UK_Charlotte", name: "Charlotte" },
        ],
        loads_as: None,
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "mlx-community/Ming-3.0-tts-0.5B-8bit", revision: "d0d1da6f627e4b3f20cc2db6ba4aee86d45343ad" },
        files: &[
            ModelFile { name: "added_tokens.json", bytes: 1_785, sha256: "34394b1e16d7da2db16618bd43a0f970902ade0075480bcd812fe62d559ec319", source: None },
            ModelFile { name: "campplus.safetensors", bytes: 27_699_096, sha256: "a479586bd8f8f96cdb414eaa2fa07c6cd54d6d1636562e2d75a0211cb3b0a6fd", source: None },
            ModelFile { name: "config.json", bytes: 6_087, sha256: "8ea3e685a870fd1a535d3b4a4c975fc20c4fca56e67acdef06fe40004064c73b", source: None },
            ModelFile { name: "merges.txt", bytes: 1_671_853, sha256: "8831e4f1a044471340f7c0a83d7bd71306a5b867e95fd870f74d0c5308a904d5", source: None },
            ModelFile { name: "model.safetensors", bytes: 1_573_366_591, sha256: "e88a4b53cb5b705703e961389f3d7f0e8b72c240b4dad796bf9961cc018971fc", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 201_850, sha256: "f59991abebed1a4f798a9488568af496d925e6eea507450aa8051a06f475a2ce", source: None },
            ModelFile { name: "special_tokens_map.json", bytes: 2_726, sha256: "2c2ec51b9da5db654ac20de8310350d0c9c1a65918ae0181b80dacd2919b4fc3", source: None },
            ModelFile { name: "tokenizer.json", bytes: 11_431_389, sha256: "87d54ca3b44ea2f822ba39a0a45cb1b61644bd6606d9d3536dea75367bffb06d", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 16_260, sha256: "12d6162c815edef24f8606e65b60d43fe0d92b0a4e150a0db8fa01c523aaf36a", source: None },
            ModelFile { name: "vocab.json", bytes: 2_776_833, sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910", source: None },
        ],
    },
    LocalModel {
        id: "kokoro",
        maker: "hexgrad",
        name: "Kokoro",
        kind: Kind::Voice,
        streams: false,
        voices: &[
            Voice { id: "af_heart", name: "Heart" },
            Voice { id: "af_bella", name: "Bella" },
            Voice { id: "am_michael", name: "Michael" },
            Voice { id: "am_fenrir", name: "Fenrir" },
        ],
        loads_as: Some("kokoro"),
        max_run_ms: None,
        languages: &[],
        detects_language: false,
        source: Source { repository: "mlx-community/Kokoro-82M-bf16", revision: "a71e4d38b236d968966a2002c4c895dbd12b1c3c" },
        files: &[
            ModelFile { name: "config.json", bytes: 2_351, sha256: "5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f", source: None },
            ModelFile { name: "kokoro-v1_0.safetensors", bytes: 327_115_152, sha256: "4e9ecdf03b8b6cf906070390237feda473dc13327cb8d56a43deaa374c02acd8", source: None },
            ModelFile { name: "voices/af_bella.safetensors", bytes: 522_320, sha256: "112d310468cbb3cf23404d3d0b50ad3adf017b87bf38bf9edd15f4ad572df6a3", source: None },
            ModelFile { name: "voices/af_heart.safetensors", bytes: 522_320, sha256: "2c1c733b0e6576c810e268d3e440c21dea4e0f0131a3ba4cfc98d7fe6136d094", source: None },
            ModelFile { name: "voices/am_fenrir.safetensors", bytes: 522_320, sha256: "9abed964b906c4cae6f404d9849e76260689aea862bc6ca85fc3f5207ba96538", source: None },
            ModelFile { name: "voices/am_michael.safetensors", bytes: 522_320, sha256: "3940147ded35deba0bb52e8132f89b719298e0520258c34584358aa5a24da2ea", source: None },
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
    fn voice_models_list_their_speakers() {
        assert_eq!(find("phonon").unwrap().voices.first().map(|v| v.id), Some("nbpkqmvs3cjeq2j8"));
        assert_eq!(find("ming-tts").unwrap().voices.first().map(|v| v.id), Some("US_James"));
        assert!(find_kind("ming-tts", Kind::Speech).is_err());
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
