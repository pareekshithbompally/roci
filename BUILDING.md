# Building Roci

Roci builds on a Mac with Apple silicon. The steps below build and run the Mac app; release builds are made the same way
by `.github/workflows/release.yml`.

## Requirements

| Tool | Version | Why |
|---|---|---|
| macOS on Apple silicon | 26 or later | The app's minimum, and MLX needs Apple silicon |
| Xcode (full app, not just the Command Line Tools) | 26 or later | Swift plugins, the MLX framework, signing |
| Xcode's Metal Toolchain | — | MLX compiles Metal shaders; `scripts/build-mlx.sh` downloads it if it's missing |
| Rust, through [rustup](https://rustup.rs) | 1.91 or later (edition 2024) | The app's core |
| Node.js and npm | Node 22 or later | The interface; use npm, not pnpm or yarn |
| CMake | any recent | Builds [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) for on-device speech (`brew install cmake`) |

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

Both commands first run `scripts/build-mlx.sh`, which builds the on-device engine (`RociMLX.framework`, MLX Swift) into
`src-tauri/frameworks`. The first time takes a few minutes; after that it is rebuilt only when its sources change. The
first Rust build also takes a while, as it compiles transcribe.cpp and SQLite's extensions.

## Checks

```bash
npx tsc --noEmit                 # types
npm test                         # unit tests
npm run audit:design             # design-system rules
(cd src-tauri && cargo build)    # Rust, with no warnings
```

## Good to know

- macOS asks for Microphone, Screen Recording, Calendar and Notifications the first time each is used.
- `npm run tauri:build` signs with a Developer ID only when `APPLE_SIGNING_IDENTITY` names a certificate in your Keychain
  (the release workflow sets it from its secrets). Only Developer ID builds appear in Spotlight.
- The app keeps its data in `~/Library/Application Support/ai.roci.roci/`, and downloaded models in its `models/` folder.
