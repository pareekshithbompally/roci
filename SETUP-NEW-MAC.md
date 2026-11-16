# Set up a new Mac

Paste the prompt below into Claude Code on the new Mac. Cloning the repo is enough; nothing outside it is needed.

```text
Set up this Mac to build and test the Roci app (Tauri 2 + React 19 + Rust + Swift plugins, macOS only).
Use npm only, never pnpm or yarn. Don't edit any project files. Stop and tell me if a step fails.

Target versions:
- macOS 27.x, Xcode 27.2 (full Xcode, not just the Command Line Tools), Swift 6.2
- Rust 1.93.0 via rustup (the project needs at least 1.91, edition 2024)
- Node 22.19.x, npm 11.x

Steps:
1. Check the macOS version and run `xcode-select -p`. If full Xcode isn't installed, stop and tell me to install it from the App Store.
   Then run `sudo xcodebuild -license accept` and `sudo xcode-select -s /Applications/Xcode.app` (I'll enter my password).
2. If Homebrew is missing, install it.
3. Install Rust with rustup (not brew): `rustup default 1.93.0`, then `rustup target add aarch64-apple-darwin`.
4. Install Node 22 with fnm or nvm and make it the default. Check `node -v` and `npm -v`.
5. If the repo isn't cloned yet, clone it into ~/Programs/my-projects:
   `git clone https://github.com/pareekshithbompally/roci.git`
   (if a GitHub login is needed, tell me to run `gh auth login`). Run `cd roci && npm ci`.
6. Run the checks and report each result:
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run build`
   - `(cd src-tauri && cargo build)`: report any warnings as well as errors
   - `npm run audit:design`
7. Start the app once with `npm run tauri:dev` (one dev server only, port 5173), then tell me it's up so I can grant permissions.

Notes:
- macOS asks for Microphone, Screen Recording, Calendar and Notifications when they're first used. I'll click those myself; don't try to script them.
- Spotlight results only appear in a build signed with my Developer ID (team 8TV3HMU3KY). Ad-hoc-signed and dev builds never show up in Spotlight. If that certificate isn't in the Keychain, just tell me.
- API keys are entered in the app's Settings. `.env.example` lists `GEMINI_API_KEY`; ask me before creating a `.env`.
```

## App data

Meetings, chats and settings live in `~/Library/Application Support/ai.roci.roci/`. To keep them, copy that folder to the new Mac with the app closed on both machines.
