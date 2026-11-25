# Building Roci

Roci builds on a Mac with Apple silicon. The steps below build and run the Mac app; release builds are made the same way
by `.github/workflows/release.yml`.

## Requirements

| Tool | Version | Why |
|---|---|---|
| macOS on Apple silicon | 26 or later | The app's minimum; on-device models run on the Apple silicon GPU |
| Xcode (full app, not just the Command Line Tools) | 26 or later | Swift plugins, signing |
| Rust, through [rustup](https://rustup.rs) | 1.91 or later (edition 2024) | The app's core |
| Node.js and npm | Node 22 or later | The interface; use npm, not pnpm or yarn |
| CMake | any recent | Builds [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) for on-device speech and llama.cpp's `llama-server` (`brew install cmake`) |

After installing Xcode, select it and accept its licence:

```bash
sudo xcode-select -s /Applications/Xcode.app
sudo xcodebuild -license accept
```

## Build and run

```bash
git clone https://github.com/pareekshithbompally/roci.git
cd roci
npm ci
npm run tauri:dev      # run the app in development
npm run tauri:build    # build Roci.app and a .dmg
```

Both commands first run `scripts/build-llama-server.sh`, which builds llama.cpp's `llama-server` from Roci's copy
(`src-tauri/engines/llama.cpp`) into `src-tauri/binaries`: the Mac bundles it and runs on-device chat, search and read
aloud in it, one process per model. It is rebuilt only when its sources change; the first time takes a few minutes.
The first Rust build also takes a while, as it compiles transcribe.cpp, llama.cpp's library and SQLite's extensions.

`npm run dev` and `npm run build` first run `npm run build:screens`: Roci's MCP App screens (`src/screens`, for agents'
apps that show them) are each built into one self-contained page in `public/screens` (generated, not committed).

## Checks

```bash
npx tsc --noEmit                 # types
npm test                         # unit tests
npm run audit:design             # design-system rules
(cd src-tauri && cargo build)    # Rust, with no warnings
```

## Security checks before each commit

```bash
brew install gitleaks semgrep
npm run hooks:install    # once: use the repo's hooks (.githooks)
npm run security         # whole history and source tree, any time
```

The pre-commit hook runs `scripts/security-scan.sh --staged`: gitleaks looks for keys and high-entropy secrets in what you
are committing (`.gitleaks.toml`), and Semgrep runs its security rules for TypeScript, Rust, shell and GitHub Actions on the
staged files. Any finding stops the commit. A false positive is marked in place with `// nosemgrep: <rule>` and a reason.

## Good to know

- macOS asks for Microphone, Screen Recording, Calendar and Notifications the first time each is used.
- `npm run tauri:build` signs with a Developer ID only when `APPLE_SIGNING_IDENTITY` names a certificate in your Keychain
  (the release workflow sets it from its secrets). Only Developer ID builds appear in Spotlight.
- The app keeps its data in `~/Library/Application Support/ai.roci.roci/`, and downloaded models in its `models/` folder.
