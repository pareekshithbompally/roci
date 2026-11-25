# transcribe.cpp in Roci

Roci's own copy, built from this folder. Nothing here is sent anywhere.

- **Upstream**: `handy-computer/transcribe.cpp` at `cfa237c2` ("ggml 1.0.0", #262), ggml `417a024b` (`ggml/UPSTREAM`).
- **Kept**: the files the Rust crates build from (the `include` list in `Cargo.toml`) and the `transcribe-cpp` wrapper.
- **Roci's changes** (also as files in `../patches/transcribe.cpp/`, to re-apply on the next upstream release):
  1. `ggml-metal`: the residency heartbeat sleeps once its keep-alive runs out.
  2. `transcribe_run_params::vocabulary_boost` / `RunOptions::vocabulary_boost`: per-run vocabulary strength (0 = default).
- **Updating**: copy the new upstream release over this folder with the same file list, then `git am` the patches.
