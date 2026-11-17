//! The curated models, every file pinned to a Hugging Face revision with its size and SHA-256.

use serde::Serialize;

use super::LocalError;

/// What a model is for, which decides the engine that runs it.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    /// Speech-to-text, run by transcribe.cpp.
    Speech,
    /// A read-aloud voice, run by Phonon (`ptts`).
    Voice,
    /// Text-to-image, run by stable-diffusion.cpp's `sd-server`; files are diffusion model, text encoder, VAE.
    Image,
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

/// A read-aloud voice of a voice model: its name, and its file in `files`.
#[cfg_attr(mobile, expect(dead_code, reason = "read by the Mac's read-aloud engine"))]
pub struct Voice {
    pub name: &'static str,
    pub file: &'static str,
}

pub struct LocalModel {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: Kind,
    /// Transcribes audio while it's still arriving (live dictation).
    pub streams: bool,
    source: Source,
    pub files: &'static [ModelFile],
    /// A voice model's voices, the first its default; empty for speech models.
    #[cfg_attr(mobile, expect(dead_code, reason = "read by the Mac's read-aloud engine"))]
    pub voices: &'static [Voice],
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
        name: "Gemma 4 E2B",
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
        name: "Qwen3 Embedding 0.6B",
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
        name: "Nemotron 3.5 ASR (multilingual)",
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
        name: "Whisper large v3 turbo",
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
        id: "phonon-31m",
        name: "Phonon 31M",
        kind: Kind::Voice,
        streams: false,
        source: Source { repository: "gradium/phonon-31m-en", revision: "92741c5b07d085ff840e26fea8ce43110b87852f" },
        files: &[
            ModelFile {
                name: "model.q8.gguf",
                bytes: 64_512_352,
                sha256: "a7d9aad2cd6dc66473f24a08bc6d2939030ef4d751ef82349361fbef3272dbae",
                source: None,
            },
            ModelFile {
                name: "config.json",
                bytes: 4_634,
                sha256: "b5d0f88353638370d94035b7d73d7d6577c0554d78f8d7ecfd40490aae39ae85",
                source: None,
            },
            ModelFile {
                name: "tokenizer.json",
                bytes: 277_967,
                sha256: "691a00068fa7b989f2f3e5ae5daa2d1a5bb319f2d5360deafcfb19a8bb6e7936",
                source: None,
            },
            ModelFile {
                name: "default-voice.safetensors",
                bytes: VOICE_BYTES,
                sha256: "dc537478eaadc1a5257fcda2e3501ab81e14c111a5d95a5838f350db2afd0f1a",
                source: None,
            },
            voice_file("voices/4SZHfMpw-p46Ywgs.safetensors", "6b3da6e2d796a20c51af892c482bd6509fb88267a221aff83c870843dee2a123"),
            voice_file("voices/bXwrkHhURL1VFJdG.safetensors", "a879938aa9a2df0a8220bdadef88137929f71e887bd91e7db205bd5fa11661d2"),
            voice_file("voices/qIxlZ7Ei8KvWlyQH.safetensors", "6e04b84d3ae8751b22bca0a4f63936f9cb648f4f2182b2d0788071ea1c0b68a1"),
            voice_file("voices/d9XCyhjo4JhkHF1d.safetensors", "eab20e4f159b48cfbc01b1885804e24f681f80e7a64f909182763a4e3361bee8"),
            voice_file("voices/6PWnV0Nq4wu7RVBT.safetensors", "56494ee67d533ad227ff0dfd0b1c13ff5aa91f1ad6e596e66c2986ba3005e844"),
            voice_file("voices/gfP44RlHwr2kEwk7.safetensors", "bcc207a73b7885e45b49ab633d3377a10158292e3a7cef9cd6764ad107f1cb9b"),
            voice_file("voices/zUCxzrOrugTSis03.safetensors", "ff1d0735b8b45710462b1d1f846da040f970c6eb62c7c2f36dbfb8e5bde74f1e"),
            voice_file("voices/YyKcxPG7iIgS3jsK.safetensors", "3169d74b47a54d1eb15e4c243f56393abe9fe90c7e1c308ecf96ee67618b152a"),
        ],
        // A clear, calm set for reading replies: American and British, female and male.
        voices: &[
            Voice { name: "Default", file: "default-voice.safetensors" },
            Voice { name: "Harper", file: "voices/4SZHfMpw-p46Ywgs.safetensors" },
            Voice { name: "Hadley", file: "voices/bXwrkHhURL1VFJdG.safetensors" },
            Voice { name: "Preston", file: "voices/qIxlZ7Ei8KvWlyQH.safetensors" },
            Voice { name: "Miles", file: "voices/d9XCyhjo4JhkHF1d.safetensors" },
            Voice { name: "Maeve", file: "voices/6PWnV0Nq4wu7RVBT.safetensors" },
            Voice { name: "Bryony", file: "voices/gfP44RlHwr2kEwk7.safetensors" },
            Voice { name: "Edwin", file: "voices/zUCxzrOrugTSis03.safetensors" },
            Voice { name: "Hugh", file: "voices/YyKcxPG7iIgS3jsK.safetensors" },
        ],
    },
    LocalModel {
        id: "z-image-turbo",
        name: "Z-Image Turbo",
        kind: Kind::Image,
        streams: false,
        voices: &[],
        source: Source { repository: "leejet/Z-Image-Turbo-GGUF", revision: "c61c0e422dc8b541b7548cf33a4ef8302b0f8085" },
        files: &[
            ModelFile {
                name: "z_image_turbo-Q4_K.gguf",
                bytes: 3_864_250_304,
                sha256: "14b375ab4f226bc5378f68f37e899ef3c2242b8541e61e2bc1aff40976086fbd",
                source: None,
            },
            ModelFile {
                name: "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
                bytes: 2_497_281_120,
                sha256: "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",
                source: Some(&QWEN3_4B_INSTRUCT),
            },
            ModelFile {
                name: "vae/diffusion_pytorch_model.safetensors",
                bytes: 167_666_902,
                sha256: "f5b59a26851551b67ae1fe58d32e76486e1e812def4696a4bea97f16604d40a3",
                source: Some(&Z_IMAGE_TURBO),
            },
        ],
    },
    LocalModel {
        id: "flux-2-klein-4b",
        name: "FLUX.2 [klein] 4B",
        kind: Kind::Image,
        streams: false,
        voices: &[],
        source: Source { repository: "leejet/FLUX.2-klein-4B-GGUF", revision: "3b1f5a9dc3abb32238b053aeb3d823c30afdacbd" },
        files: &[
            ModelFile {
                name: "flux-2-klein-4b-Q8_0.gguf",
                bytes: 4_300_629_440,
                sha256: "0bba6951258ec8f92d51114a8fa13e66828297bfff58a738f52729b3ef66fa28",
                source: None,
            },
            ModelFile {
                name: "Qwen3-4B-Q4_K_M.gguf",
                bytes: 2_497_281_312,
                sha256: "f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a",
                source: Some(&QWEN3_4B),
            },
            ModelFile {
                name: "vae/diffusion_pytorch_model.safetensors",
                bytes: 168_120_878,
                sha256: "ca70d2202afe6415bdbcb8793ba8cd99fd159cfe6192381504d6c4d3036e0f04",
                source: Some(&FLUX_2_KLEIN_4B),
            },
        ],
    },
];

/// Every Phonon voice file is one speaker embedding of this size.
const VOICE_BYTES: u64 = 256_136;
const PHONON_VOICES: Source = Source { repository: "gradium/phonon-voices", revision: "0ee17205f254b5abc43b266c8a0f215565c352f7" };
/// Image models' text encoders and VAEs, each from its Apache-2.0, ungated upstream repository.
const QWEN3_4B_INSTRUCT: Source = Source { repository: "unsloth/Qwen3-4B-Instruct-2507-GGUF", revision: "a06e946bb6b655725eafa393f4a9745d460374c9" };
const QWEN3_4B: Source = Source { repository: "unsloth/Qwen3-4B-GGUF", revision: "22c9fc8a8c7700b76a1789366280a6a5a1ad1120" };
const Z_IMAGE_TURBO: Source = Source { repository: "Tongyi-MAI/Z-Image-Turbo", revision: "f332072aa78be7aecdf3ee76d5c247082da564a6" };
const FLUX_2_KLEIN_4B: Source = Source { repository: "black-forest-labs/FLUX.2-klein-4B", revision: "e7b7dc27f91deacad38e78976d1f2b499d76a294" };

const fn voice_file(name: &'static str, sha256: &'static str) -> ModelFile {
    ModelFile { name, bytes: VOICE_BYTES, sha256, source: Some(&PHONON_VOICES) }
}

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
    fn voices_name_files_of_their_model() {
        let phonon = find("phonon-31m").unwrap();
        assert!(phonon.voices.iter().all(|v| phonon.files.iter().any(|f| f.name == v.file)));
        assert_eq!(
            phonon.url(&phonon.files[4]),
            "https://huggingface.co/gradium/phonon-voices/resolve/0ee17205f254b5abc43b266c8a0f215565c352f7/voices/4SZHfMpw-p46Ywgs.safetensors"
        );
    }

    #[test]
    fn files_are_pinned_to_a_revision() {
        let model = find("whisper-large-v3-turbo").unwrap();
        assert_eq!(
            model.url(model.main_file()),
            "https://huggingface.co/handy-computer/whisper-large-v3-turbo-gguf/resolve/d222c9f621c1128299248f2ded4d8a1820519780/whisper-large-v3-turbo-Q8_0.gguf"
        );
        assert_eq!(find("phonon-31m").unwrap().bytes(), 65_051_089 + 8 * VOICE_BYTES);
        assert!(find_kind("phonon-31m", Kind::Speech).is_err());
        assert!(find("nope").is_err());
    }
}
