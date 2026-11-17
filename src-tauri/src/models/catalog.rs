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

impl Kind {
    /// Whether this device has the engine: the Mac runs every kind; iPhone and iPad run MLX's (chat, meeting search).
    pub fn runs_here(self) -> bool {
        cfg!(desktop) || matches!(self, Kind::Chat | Kind::Embedding)
    }
}

/// A Hugging Face repository at a pinned commit.
pub struct Source {
    repository: &'static str,
    revision: &'static str,
}

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
    /// A voice model's speaker names, the first its default; empty when it has one voice.
    #[cfg_attr(mobile, expect(dead_code, reason = "read by the Mac's read-aloud engine"))]
    pub voices: &'static [&'static str],
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
    #[cfg_attr(mobile, expect(dead_code, reason = "used by the Mac's speech and voice engines"))]
    pub fn main_file(&self) -> &'static ModelFile {
        &self.files[0]
    }
}

/// Picker order within each kind: the live-capable speech models first.
pub const MODELS: &[LocalModel] = &[
    LocalModel {
        id: "gemma-4-e2b",
        maker: "google",
        name: "Gemma 4",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        source: Source { repository: "mlx-community/gemma-4-e2b-it-4bit", revision: "238767527555cb75a05732a84dff5d6ba0dd6809" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 17_336, sha256: "2f1b4d75d067bae3fe44e676721c7f077d243bc007156cb9c2f8b5836613d082", source: None },
            ModelFile { name: "config.json", bytes: 6_395, sha256: "6397cb6eca41b911d1dcab74e17941351057bd759284052a2331918ff6f9246c", source: None },
            ModelFile { name: "generation_config.json", bytes: 208, sha256: "d4226bbe3117d2d253ba4609720ba82c6c4ce4627a9a6ae05387c78983ac03de", source: None },
            ModelFile { name: "model.safetensors", bytes: 3_550_670_554, sha256: "038e39a37a7667373d2c3991375446b10c96ae1d717a68674870343db376b76e", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 218_323, sha256: "edb157dbf495e23f37377af4a628a9ad13c4ee7937f93ccb36ec9e9a19940f16", source: None },
            ModelFile { name: "processor_config.json", bytes: 1_316, sha256: "de3e580aebdc98272d4c4547daffe6525fcbae18a83a0e0bcf0d7444d4ee6f37", source: None },
            ModelFile { name: "tokenizer.json", bytes: 32_169_626, sha256: "cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 2_740, sha256: "080d9e1aff284e2f6043889cd05367966f7c7b80e025fbc0b06745e218158656", source: None },
        ],
    },
    LocalModel {
        id: "qwen3-embedding-0.6b",
        maker: "Qwen",
        name: "Qwen3 Embedding",
        kind: Kind::Embedding,
        streams: false,
        voices: &[],
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
        name: "Parakeet (English)",
        kind: Kind::Speech,
        streams: true,
        voices: &[],
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
        name: "Nemotron (multilingual)",
        kind: Kind::Speech,
        streams: true,
        voices: &[],
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
        source: Source { repository: "handy-computer/whisper-large-v3-turbo-gguf", revision: "d222c9f621c1128299248f2ded4d8a1820519780" },
        files: &[ModelFile {
            name: "whisper-large-v3-turbo-Q8_0.gguf",
            bytes: 886_381_824,
            sha256: "d5e65f2b0828802ae2c231673d31982cebe3a778c95d9494a9f3efee6bd17448",
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
        source: Source { repository: "handy-computer/cohere-transcribe-03-2026-gguf", revision: "dfa4adebb64f3076b7b6b90b721275cc069cb421" },
        files: &[ModelFile {
            name: "cohere-transcribe-03-2026-Q8_0.gguf",
            bytes: 2_410_655_232,
            sha256: "931916663432fd895423a4291a8400221802b288967ca2d435fc5e3141c9e71e",
            source: None,
        }],
    },
    LocalModel {
        id: "soprano",
        maker: "ekwek",
        name: "Soprano",
        kind: Kind::Voice,
        streams: false,
        voices: &[],
        source: Source { repository: "mlx-community/Soprano-80M-bf16", revision: "b7da048eff3dfd556409a44b78b9c61a9dd4ccfa" },
        files: &[
            ModelFile { name: "config.json", bytes: 680, sha256: "dcef1db183ebe876461286b3e0b1859c1068a187b32d6274306794c2ee428a93", source: None },
            ModelFile { name: "model.safetensors", bytes: 217_333_883, sha256: "95e42d42bc879213d49d940e0884024eb153fb6daccf2229864cca0fbbbb268a", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 20_898, sha256: "c89dd3632bb97cdc002cbcdeec00e93c569bcc56e88c52a35612039654595f43", source: None },
            ModelFile { name: "special_tokens_map.json", bytes: 158, sha256: "d6987802b7ab3904b190fa17c8dc47757892cc67d02ac571074e67441bc6f70f", source: None },
            ModelFile { name: "tokenizer.json", bytes: 1_792_331, sha256: "5952e532af20bc935a29293725394bdb32a6a286e811a22f930a594ece59102c", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 1_494_887, sha256: "1bd29465c2834d676be5ceaf32272a604522ef85659a2cb09a8ae1ea7d40ba76", source: None },
        ],
    },
    LocalModel {
        id: "pocket-tts",
        maker: "kyutai",
        name: "Pocket TTS",
        kind: Kind::Voice,
        streams: false,
        voices: &["Alba", "Marius", "Javert", "Jean", "Fantine", "Cosette", "Eponine", "Azelma"],
        source: Source { repository: "mlx-community/pocket-tts", revision: "cbf71d5f6657bbc3f4bc02f85ee408261225bec7" },
        files: &[
            ModelFile { name: "config.json", bytes: 1_664, sha256: "403ff12260596fbfa348c7b07237c378b9ad8db9d8acd04d671470421954a68e", source: None },
            ModelFile { name: "embeddings/alba.safetensors", bytes: 512_088, sha256: "ad234695323e4030336b6afc8a050c97e3110603e11ecd8226d9562488300a50", source: None },
            ModelFile { name: "embeddings/azelma.safetensors", bytes: 659_544, sha256: "ef33fad34437cb187d2702f0a946d8ba7a01efdb8efbc8088c770d49c181ba73", source: None },
            ModelFile { name: "embeddings/cosette.safetensors", bytes: 512_088, sha256: "ca8926c4f234afa9d722173967e7bebdc6269538ca5910d65f41c3c1317717d3", source: None },
            ModelFile { name: "embeddings/eponine.safetensors", bytes: 573_528, sha256: "bb31940f62da665391de139da2e57d740757df26b73d7ec24152c78a3b8ac0c5", source: None },
            ModelFile { name: "embeddings/fantine.safetensors", bytes: 540_760, sha256: "b6918a2ece002d2d9037ff53c4ea38730175e8798786658b0958443edf49d355", source: None },
            ModelFile { name: "embeddings/javert.safetensors", bytes: 512_088, sha256: "2e857904ee76657e083b0e92664d21bd133e37df320af6eb04f752e679422d91", source: None },
            ModelFile { name: "embeddings/jean.safetensors", bytes: 512_088, sha256: "329530f87ce503061acefca8669300963420ff97e43647a326aa46bd987b983c", source: None },
            ModelFile { name: "embeddings/marius.safetensors", bytes: 512_088, sha256: "33f75e45fac0005630671f4b1bb632d51b6a083b18417de94855bbd7596a0630", source: None },
            ModelFile { name: "model.safetensors", bytes: 235_739_497, sha256: "60ddd85019dddbe6c1d220e311ca5fc753972978a89f563c0bbe1ae943120072", source: None },
            ModelFile { name: "special_tokens_map.json", bytes: 95, sha256: "0655d856e7dd462048486aac66d4247753e5cab12480baeb9f4e8f7fe03f7d4c", source: None },
            ModelFile { name: "tokenizer.json", bytes: 244_993, sha256: "ef29c4871fd62c7beb928150edc095be1327f0924c0eab9e06b95918b39eff5f", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 220, sha256: "ad6dc6a5790d0f94170998ab79921c97d28ea54602abcdb33cba3132d13ac233", source: None },
        ],
    },
    LocalModel {
        id: "qwen3-tts",
        maker: "Qwen",
        name: "Qwen3 TTS",
        kind: Kind::Voice,
        streams: false,
        voices: &["Ryan", "Aiden"],
        source: Source { repository: "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit", revision: "049ef77fe8816b536193c0c25f9a214d17921282" },
        files: &[
            ModelFile { name: "config.json", bytes: 6_058, sha256: "2eea3665564268139c3beb8d497fd3c2e4524e9eed5452836cdf1de96ed3cdbd", source: None },
            ModelFile { name: "generation_config.json", bytes: 245, sha256: "f1b90b4513f3b34c62851049e2492d7b4c5940daf1276f89c82b8ef04127f3aa", source: None },
            ModelFile { name: "merges.txt", bytes: 1_671_839, sha256: "599bab54075088774b1733fde865d5bd747cbcc7a547c5bc12610e874e26f5e3", source: None },
            ModelFile { name: "model.safetensors", bytes: 1_286_743_170, sha256: "3bcb2c4a127e6243e81a30b7126c7865f686d3559de4f938e5d3b150c6a9560d", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 71_447, sha256: "0c92041960fa189cf35ae538c8d9ca07c468edddd0c9bb52274c5d4d287a860b", source: None },
            ModelFile { name: "preprocessor_config.json", bytes: 127, sha256: "efdde1022ea9d76928bf7a9cd53139138f5ba2e466e837f08f6105ab1af1c119", source: None },
            ModelFile { name: "speech_tokenizer/config.json", bytes: 2_336, sha256: "ee65bb901c876664ab8707c487157aa1a6ee57c65969b28fb5ec9dc211e68167", source: None },
            ModelFile { name: "speech_tokenizer/configuration.json", bytes: 76, sha256: "6bc26d64eb5024b4d1dab5a52371958b429256d6c9d59787f1f5294a54e0cebd", source: None },
            ModelFile { name: "speech_tokenizer/model.safetensors", bytes: 682_293_092, sha256: "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258", source: None },
            ModelFile { name: "speech_tokenizer/preprocessor_config.json", bytes: 234, sha256: "fcb3805e597e786d4067706e602f6688524640f8d3396790e2e09b5942fcbdfb", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 7_344, sha256: "dc3c31c3bdaedd5016382bb3cbe07323026775ad51f5a4fb564505992ae4a670", source: None },
            ModelFile { name: "vocab.json", bytes: 2_776_833, sha256: "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910", source: None },
        ],
    },
];



/// A model this device can run.
pub fn find(id: &str) -> Result<&'static LocalModel, LocalError> {
    MODELS.iter().find(|m| m.id == id && m.kind.runs_here()).ok_or_else(|| LocalError::UnknownModel(id.to_string()))
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
        assert_eq!(find("pocket-tts").unwrap().voices.first(), Some(&"Alba"));
        assert!(find("soprano").unwrap().voices.is_empty());
        assert!(find_kind("qwen3-tts", Kind::Speech).is_err());
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
