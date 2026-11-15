//! The curated models. Speech-to-text files are pinned exactly as Hex pins them
//! for the same transcribe.cpp version (Hex `src/transcription/artifacts.rs`);
//! Phonon is pinned to the commit `ptts` itself loads by default
//! (`ptts::checkpoint::DEFAULT_MODEL`). Every file carries its size and SHA-256.

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
}

pub struct ModelFile {
    pub name: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
}

pub struct LocalModel {
    pub id: &'static str,
    pub name: &'static str,
    pub kind: Kind,
    repository: &'static str,
    revision: &'static str,
    pub files: &'static [ModelFile],
}

impl LocalModel {
    pub fn url(&self, file: &ModelFile) -> String {
        format!("https://huggingface.co/{}/resolve/{}/{}", self.repository, self.revision, file.name)
    }

    pub fn bytes(&self) -> u64 {
        self.files.iter().map(|f| f.bytes).sum()
    }

    /// The file an engine loads (speech models are a single GGUF).
    pub fn main_file(&self) -> &'static ModelFile {
        &self.files[0]
    }
}

/// Picker order within each kind.
pub const MODELS: &[LocalModel] = &[
    LocalModel {
        id: "parakeet-unified-en",
        name: "Parakeet (English)",
        kind: Kind::Speech,
        repository: "handy-computer/parakeet-unified-en-0.6b-gguf",
        revision: "7e948f21b7bdbac698d3318db9d350f1096f3b6c",
        files: &[ModelFile {
            name: "parakeet-unified-en-0.6b-Q8_0.gguf",
            bytes: 731_357_568,
            sha256: "4b50b6dd862bf6e346929aaf4f5eaacec003bfa3f56462d6c874b41ef2f38795",
        }],
    },
    LocalModel {
        id: "whisper-large-v3-turbo",
        name: "Whisper large v3 turbo",
        kind: Kind::Speech,
        repository: "handy-computer/whisper-large-v3-turbo-gguf",
        revision: "d222c9f621c1128299248f2ded4d8a1820519780",
        files: &[ModelFile {
            name: "whisper-large-v3-turbo-Q8_0.gguf",
            bytes: 886_381_824,
            sha256: "d5e65f2b0828802ae2c231673d31982cebe3a778c95d9494a9f3efee6bd17448",
        }],
    },
    LocalModel {
        id: "cohere-transcribe",
        name: "Cohere Transcribe",
        kind: Kind::Speech,
        repository: "handy-computer/cohere-transcribe-03-2026-gguf",
        revision: "dfa4adebb64f3076b7b6b90b721275cc069cb421",
        files: &[ModelFile {
            name: "cohere-transcribe-03-2026-Q8_0.gguf",
            bytes: 2_410_655_232,
            sha256: "931916663432fd895423a4291a8400221802b288967ca2d435fc5e3141c9e71e",
        }],
    },
    LocalModel {
        id: "phonon-31m",
        name: "Phonon 31M",
        kind: Kind::Voice,
        repository: "gradium/phonon-31m-en",
        revision: "92741c5b07d085ff840e26fea8ce43110b87852f",
        files: &[
            ModelFile {
                name: "model.q8.gguf",
                bytes: 64_512_352,
                sha256: "a7d9aad2cd6dc66473f24a08bc6d2939030ef4d751ef82349361fbef3272dbae",
            },
            ModelFile {
                name: "config.json",
                bytes: 4_634,
                sha256: "b5d0f88353638370d94035b7d73d7d6577c0554d78f8d7ecfd40490aae39ae85",
            },
            ModelFile {
                name: "tokenizer.json",
                bytes: 277_967,
                sha256: "691a00068fa7b989f2f3e5ae5daa2d1a5bb319f2d5360deafcfb19a8bb6e7936",
            },
            ModelFile {
                name: "default-voice.safetensors",
                bytes: 256_136,
                sha256: "dc537478eaadc1a5257fcda2e3501ab81e14c111a5d95a5838f350db2afd0f1a",
            },
        ],
    },
];

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
    fn files_are_pinned_to_a_revision() {
        let model = find("whisper-large-v3-turbo").unwrap();
        assert_eq!(
            model.url(model.main_file()),
            "https://huggingface.co/handy-computer/whisper-large-v3-turbo-gguf/resolve/d222c9f621c1128299248f2ded4d8a1820519780/whisper-large-v3-turbo-Q8_0.gguf"
        );
        assert_eq!(find("phonon-31m").unwrap().bytes(), 65_051_089);
        assert!(find_kind("phonon-31m", Kind::Speech).is_err());
        assert!(find("nope").is_err());
    }
}
