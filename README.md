# Kasset AI 🎙️

**macOS desktop app for real-time voice transcription and AI-powered summarization**

[![Tauri](https://img.shields.io/badge/Tauri-2.x-blue?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite)](https://vitejs.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-AI-8E75B2?logo=google)](https://deepmind.google/technologies/gemini/)

---

## Features

- 🎤 Real-time audio recording (microphone + system audio via BlackHole)
- 🤖 AI transcription powered by Google Gemini
- 💬 Chat with AI about your transcripts
- 📊 Searchable recording history with categories
- 🎨 Dark/Light themes
- ⌨️ Keyboard shortcuts
- 🔒 All data stored locally

---

## Quick Start

### 1. Setup API Key
- Get a free key from [Google AI Studio](https://makersuite.google.com/app/apikey)
- Paste in Settings (⚙️)

### 2. Record
- Click 🎤 or press `Cmd+R`
- Stop when done

### 3. Review
- Transcript appears automatically
- Chat with AI via 💬

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Record | `Cmd+R` |
| Chat | `Cmd+K` |
| Settings | `Cmd+,` |
| Search | `Cmd+F` |

---

## Development Setup

### Prerequisites

**System Requirements:**
- macOS 13.0 (Ventura) or later
- Node.js 18+ ([Download](https://nodejs.org/))
- Rust 1.77+ ([Install via rustup](https://rustup.rs/))
- Xcode Command Line Tools: `xcode-select --install`
- Swift 6.2.3 toolchain ([Download](https://www.swift.org/install/macos/))

**Optional (for system audio capture):**
- [BlackHole](https://existential.audio/blackhole/) audio driver

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/pareekshithbompally/kasset-ai.git
   cd kasset-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API key**
   ```bash
   # Copy the example environment file
   cp .env.example .env.local

   # Edit .env.local and add your Gemini API key
   # Get a free key from: https://makersuite.google.com/app/apikey
   ```

4. **Verify Swift runtime setup**
   ```bash
   # Check Swift version
   swift --version  # Should show 6.2.3

   # The build process automatically bundles Swift runtime via:
   # scripts/prepare-swift-runtime.sh
   ```

### Development Commands

```bash
# Start development server (recommended)
npm run tauri:dev

# Frontend only (for UI development)
npm run dev

# Production build
npm run tauri:build

# Run tests
npm test
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

### Build Process

The project uses a custom Swift runtime bundling process:

1. Rust binary is built in `src-tauri/target/release/`
2. `prepare-swift-runtime.sh` extracts Swift runtime dependencies
3. Swift libraries are bundled into the `.app` package at `Contents/Frameworks/`
4. Entitlements (`entitlements.plist`) are applied for:
   - Microphone access (`com.apple.security.device.audio-input`)
   - Screen recording (`com.apple.security.device.camera`)
   - Network access (`com.apple.security.network.client`)
   - File system access (`com.apple.security.files.user-selected.read-write`)

### Troubleshooting

**"Swift runtime not found" error:**
```bash
# Install Swift toolchain from swift.org
# Verify installation
ls -la ~/Library/Developer/Toolchains/
```

**"Permission denied" errors:**
```bash
# Make scripts executable
chmod +x scripts/prepare-swift-runtime.sh
```

**"CoreAudio not working" in development:**
- Ensure Xcode Command Line Tools are installed
- Run `npm run tauri:dev` (not just `npm run dev`)

---

## Project Structure

```
kasset-ai/
├── src/
│   ├── app/           # App bootstrap
│   ├── features/      # Feature modules (chat, recording, history, etc.)
│   ├── shared/        # Shared contexts, hooks, utils
│   └── config/        # Configuration
├── services/          # Business logic & APIs
├── tests/             # Test files
└── src-tauri/         # Rust backend
```

See [AGENTS.md](AGENTS.md) for detailed architecture guidelines.

---

## Tech Stack

- [Tauri 2.x](https://tauri.app/) - Desktop framework
- [React 19](https://react.dev/) - UI
- [Vite](https://vitejs.dev/) - Build tool
- [Google Gemini](https://deepmind.google/technologies/gemini/) - AI

---

## License

MIT
