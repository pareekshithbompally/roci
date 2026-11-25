//! llama.cpp for Roci, on transcribe.cpp's ggml: the C shim's functions (`shim/roci_llama.cpp`).

use std::ffi::{c_char, c_int, c_void};

// Keeps transcribe-cpp-sys (and with it the one ggml) linked whenever this crate is.
pub use transcribe_cpp_sys as _ggml_owner;

/// A loaded chat model and its context (opaque).
#[repr(C)]
pub struct RociLlamaChat {
    _private: [u8; 0],
}

/// A loaded embedding model and its context (opaque).
#[repr(C)]
pub struct RociLlamaEmbedder {
    _private: [u8; 0],
}

/// A loaded speech model and its audio projector (opaque).
#[repr(C)]
pub struct RociLlamaVoice {
    _private: [u8; 0],
}

pub type EventFn = extern "C" fn(*mut c_void, *const c_char);
pub type CheckpointFn = extern "C" fn();
pub type PressureFn = extern "C" fn(level: c_int);

unsafe extern "C" {
    pub fn roci_llama_free_string(value: *mut c_char);
    pub fn roci_llama_set_checkpoint(hook: CheckpointFn);
    pub fn roci_llama_chat_open(path: *const c_char, n_ctx: c_int, error: *mut *mut c_char) -> *mut RociLlamaChat;
    pub fn roci_llama_chat_close(chat: *mut RociLlamaChat);
    pub fn roci_llama_cancel(stream_id: u64);
    pub fn roci_llama_embed_open(path: *const c_char, n_ctx: c_int, error: *mut *mut c_char) -> *mut RociLlamaEmbedder;
    pub fn roci_llama_embed_close(embedder: *mut RociLlamaEmbedder);
    pub fn roci_llama_embed(embedder: *mut RociLlamaEmbedder, texts: *const c_char) -> *mut c_char;
    pub fn roci_llama_voice_open(path: *const c_char, projector: *const c_char, error: *mut *mut c_char) -> *mut RociLlamaVoice;
    pub fn roci_llama_voice_close(voice: *mut RociLlamaVoice);
    pub fn roci_llama_speak(
        voice: *mut RociLlamaVoice,
        text: *const c_char,
        voice_name: *const c_char,
        lang: *const c_char,
        wav: *mut *mut u8,
        wav_len: *mut usize,
        error: *mut *mut c_char,
    ) -> c_int;
    pub fn roci_llama_free_bytes(bytes: *mut u8);
    pub fn roci_llama_memory() -> *mut c_char;
    pub fn roci_llama_watch_pressure(on_pressure: PressureFn);
    pub fn roci_llama_model_info(path: *const c_char) -> *mut c_char;
    pub fn roci_llama_project_memory(path: *const c_char, n_ctx: c_int, kv_type: *const c_char) -> *mut c_char;
    pub fn roci_llama_chat_reply(chat: *mut RociLlamaChat, request: *const c_char, on_event: EventFn, user: *mut c_void) -> *mut c_char;
}

#[cfg(test)]
mod tests {
    use std::ffi::{CStr, CString};

    /// llama.cpp's projection for a model at 8k, 16k and 32k tokens with a full-precision and compressed KV cache, as
    /// Roci shows it in Model Tuning. `ROCI_LLAMA_GGUF` is the model file.
    #[test]
    #[ignore = "needs a downloaded model"]
    fn projects_memory_without_loading_weights() {
        let path = CString::new(std::env::var("ROCI_LLAMA_GGUF").expect("ROCI_LLAMA_GGUF")).unwrap();
        for kv_type in ["f16", "q8_0", "q4_0"] {
            for tokens in [8192, 16384, 32768] {
                let kv = CString::new(kv_type).unwrap();
                // SAFETY: valid C strings; the reply is freed once, below.
                let started = std::time::Instant::now();
                let reply = unsafe { super::roci_llama_project_memory(path.as_ptr(), tokens, kv.as_ptr()) };
                let text = unsafe { CStr::from_ptr(reply) }.to_string_lossy().into_owned();
                unsafe { super::roci_llama_free_string(reply) };
                println!("{kv_type} {tokens}: {text} in {:?}", started.elapsed());
                assert!(text.contains("\"ok\":true"), "{text}");
            }
        }
    }
}
