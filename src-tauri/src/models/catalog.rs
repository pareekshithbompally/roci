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
        id: "smollm3-3b",
        maker: "HuggingFaceTB",
        name: "SmolLM3 3B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        source: Source { repository: "mlx-community/SmolLM3-3B-4bit", revision: "d3a7e0594d6642dbcfb7d149bed8b0bdf49f95ce" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 5_499, sha256: "0dab472abbdc499c8d82acae3ad6e8404f672d2d50d9df582181daf062f66eb7", source: None },
            ModelFile { name: "config.json", bytes: 2_394, sha256: "6d0046fc9fc07c74601b25107b8ff96077dc9c63941492f2856743eabc2a3d99", source: None },
            ModelFile { name: "generation_config.json", bytes: 182, sha256: "3458d62b3f9654f4bbe285223b0f4e5a1e67cae61c92bb6aeaadf04468bf9e01", source: None },
            ModelFile { name: "model.safetensors", bytes: 1_730_051_993, sha256: "d501e6193d7eb84e10d3c377007d1fc4b4b2fa08799dd10fa4f6a75033334a70", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 58_800, sha256: "64148ac05ad909f2fc69ec126ef9efe38545512a41914bdba17d1dc29437c19d", source: None },
            ModelFile { name: "special_tokens_map.json", bytes: 289, sha256: "12403efb970f069ba62ddf3b66166a27254be4a198166b61ad1ee604bd3a4515", source: None },
            ModelFile { name: "tokenizer.json", bytes: 17_208_819, sha256: "7b6a500b662a34eb3f0374db856ba4ad7de4c81040571d78dc0d357238930005", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 50_387, sha256: "59a64b39f05ee0acf7479bbccf99a44d9e481c1a4a494eb03838ae3c35eb29be", source: None },
        ],
    },
    LocalModel {
        id: "granite-4.0-h-micro",
        maker: "ibm-granite",
        name: "Granite 4.0 H Micro",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
        source: Source { repository: "mlx-community/granite-4.0-h-micro-4bit", revision: "0a29e17503da7de371af61a0a532853810637627" },
        files: &[
            ModelFile { name: "chat_template.jinja", bytes: 6_099, sha256: "fed2756d2d24e127b951dcf139d0b03ab7db8ef23a456128ebc9c2db4901d476", source: None },
            ModelFile { name: "config.json", bytes: 2_256, sha256: "d42f4e62696734e58fc57f733c3ca83ebb5a21f774de16d8b00010d36b08c98e", source: None },
            ModelFile { name: "generation_config.json", bytes: 147, sha256: "7c04cb9d2ba771f7528fba5a7104999cdaf7566d02b5fbd58472829f62716177", source: None },
            ModelFile { name: "merges.txt", bytes: 916_646, sha256: "b6fe424e334903f7fb84d3a106d9730455f4744b9fe3c21ee136d97a00e72502", source: None },
            ModelFile { name: "model.safetensors", bytes: 1_796_848_117, sha256: "573654ce0613804f3e0e5ec692b039f907f13c88273dc08993b9adbeb04428f1", source: None },
            ModelFile { name: "model.safetensors.index.json", bytes: 62_836, sha256: "7506c4d473813c56dbe385ed0a243e497c5eec18d52e15d3e6efb317bf00e1f0", source: None },
            ModelFile { name: "special_tokens_map.json", bytes: 579, sha256: "c08676c49fd7969a3130f72be6d4bf34da66aa484a6e21dffe359893a1bd5f2e", source: None },
            ModelFile { name: "tokenizer.json", bytes: 7_153_421, sha256: "e2bad66439538cb4d5a7580680932432ed9ece9d3b8577e675512bdf11599253", source: None },
            ModelFile { name: "tokenizer_config.json", bytes: 17_659, sha256: "a5ec5daab12ba090a90f3dd169c8f9c275557013a87b9c1258dc7cb497a35c86", source: None },
            ModelFile { name: "vocab.json", bytes: 1_612_704, sha256: "8af71076de8b0b626eed0f4c984faf0a7c062479164b2a31308a948524d4f69c", source: None },
        ],
    },
    LocalModel {
        id: "ternary-bonsai-2-4b",
        maker: "prism-ml",
        name: "Ternary Bonsai 2 4B",
        kind: Kind::Chat,
        streams: false,
        voices: &[],
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
        id: "whisper-small",
        maker: "openai",
        name: "Whisper Small",
        kind: Kind::Speech,
        streams: false,
        voices: &[],
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
        source: Source { repository: "handy-computer/cohere-transcribe-03-2026-gguf", revision: "dfa4adebb64f3076b7b6b90b721275cc069cb421" },
        files: &[ModelFile {
            name: "cohere-transcribe-03-2026-Q8_0.gguf",
            bytes: 2_410_655_232,
            sha256: "931916663432fd895423a4291a8400221802b288967ca2d435fc5e3141c9e71e",
            source: None,
        }],
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
        voices: &[
            Voice { id: "alba", name: "Alba" },
            Voice { id: "marius", name: "Marius" },
            Voice { id: "javert", name: "Javert" },
            Voice { id: "jean", name: "Jean" },
            Voice { id: "fantine", name: "Fantine" },
            Voice { id: "cosette", name: "Cosette" },
            Voice { id: "eponine", name: "Eponine" },
            Voice { id: "azelma", name: "Azelma" },
        ],
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
        voices: &[Voice { id: "ryan", name: "Ryan" }, Voice { id: "aiden", name: "Aiden" }],
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



/// A curated model by id.
pub fn find(id: &str) -> Result<&'static LocalModel, LocalError> {
    MODELS.iter().find(|m| m.id == id).ok_or_else(|| LocalError::UnknownModel(id.to_string()))
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
        assert_eq!(find("pocket-tts").unwrap().voices.first().map(|v| v.id), Some("alba"));
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
