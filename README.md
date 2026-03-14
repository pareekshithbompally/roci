# Kasset AI

**Meeting intelligence for macOS — private, local-first, with a built-in general-purpose AI chat.**

Kasset captures system audio and microphone in real time, transcribes meetings, and lets you chat with any AI provider about what was said. All data stays on your machine. No cloud storage, no telemetry.

[![Tauri](https://img.shields.io/badge/Tauri-2.x-blue?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![macOS](https://img.shields.io/badge/macOS-15.0+-000?logo=apple)](https://www.apple.com/macos/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Features

- **Real-time audio capture** — system audio + microphone via ScreenCaptureKit (no third-party drivers needed)
- **AI transcription** — powered by your choice of provider
- **General-purpose chat** — ask questions about transcripts or anything else
- **Meeting RAG** — vector search across past meetings using local sqlite-vec
- **Multi-provider support** — bring your own API keys for 12+ providers
- **Local-first** — all recordings, transcripts, and data stored on-device
- **Dark and light themes**

---

## Download

Grab the latest `.dmg` from [GitHub Releases](https://github.com/pareekshithbompally/kasset-ai/releases).

> Requires **macOS 15.0** (Sequoia) or later on **Apple Silicon** (M1+).
>
> The app is not code-signed yet — on first launch, right-click the app and select **Open**.

---

## Supported Providers

Configure any combination in Settings. Bring your own API keys.

| Provider | Type |
|----------|------|
| OpenAI | Native SDK |
| Anthropic (Claude) | Native SDK |
| Google Gemini | Native SDK |
| Mistral AI | OpenAI-compatible |
| Groq | OpenAI-compatible |
| OpenRouter | OpenAI-compatible |
| Cohere | OpenAI-compatible |
| Azure OpenAI | OpenAI-compatible |
| Hugging Face | OpenAI-compatible |
| xAI (Grok) | OpenAI-compatible |
| Llama.cpp | Local |
| Local Server (Ollama, LM Studio, Jan) | Local |

---

## Development

### Prerequisites

- macOS 15.0+
- [Node.js 20+](https://nodejs.org/)
- [Rust 1.77+](https://rustup.rs/)
- Xcode Command Line Tools — `xcode-select --install`

### Setup

```bash
git clone https://github.com/pareekshithbompally/kasset-ai.git
cd kasset-ai
npm install
npm run tauri:dev
```

### Commands

```bash
npm run tauri:dev       # Run the app in development
npm run tauri:build     # Production build (outputs .dmg)
npm run dev             # Frontend only (UI work)
npm test                # Run tests
```

---

## Architecture

```
kasset-ai/
├── src/                # React frontend
│   ├── features/       # Chat, recording, history, settings, transcription
│   ├── shared/         # Contexts, hooks, utilities
│   └── config/         # App configuration
├── services/           # API adapters, platform fetch, business logic
├── src-tauri/          # Rust backend (audio capture, vector DB, local LLM)
│   ├── plugins/        # tauri-plugin-llamacpp, tauri-plugin-vectordb
│   └── src/            # Audio core (ScreenCaptureKit), commands
└── scripts/            # Build helpers (Swift runtime bundling)
```

See [AGENTS.md](AGENTS.md) for detailed guidelines.

---

## Built by

Product, architecture, and design by [Pareekshith Bompally](https://github.com/pareekshithbompally). Built with AI coding agents.

## Acknowledgements

- [Jan.ai](https://jan.ai/) — inspiration for building a privacy-first, local-first AI application
- [llama.cpp](https://github.com/ggerganov/llama.cpp) — local LLM inference

## License

MIT
