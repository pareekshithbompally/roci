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
    /// Text-to-image, run by stable-diffusion.cpp (`diffusion-rs`); files are diffusion model, text encoder, VAE.
    Image,
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
    pub fn main_file(&self) -> &'static ModelFile {
        &self.files[0]
    }
}

/// Picker order within each kind: the live-capable speech models first.
pub const MODELS: &[LocalModel] = &[
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
