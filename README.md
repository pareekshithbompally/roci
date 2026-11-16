# Roci AI

> **Private, local-first meeting intelligence for macOS**

Roci AI captures, transcribes, and analyzes your meetings — entirely on your machine. Built-in AI chat lets you search across meetings, extract action items, and get instant answers from your meeting history.

## ✨ Features

### 🎙️ Audio Capture
- **System audio + microphone** recording via macOS ScreenCaptureKit (no BlackHole or virtual audio drivers needed)
- **Pause & resume** recording, multi-session support
- Real-time audio level visualization
- Automatic sleep prevention during recording

### 🤖 Multi-Provider AI
- **12+ AI providers**: OpenAI, Anthropic (Claude), Google Gemini, Mistral, Groq, xAI (Grok), OpenRouter, Azure, Cohere, HuggingFace, and more
- **Local AI**: use models from a server running on your Mac (Ollama, LM Studio, llama.cpp server, vLLM, Jan)
- Powered by the **Vercel AI SDK** for unified provider routing
- Automatic transcription, summarization, and action item extraction

### 💬 AI Chat
- General-purpose AI chat with streaming responses
- **Meeting-aware**: Ask questions about past meetings, search across transcripts
- **Tool calling**: 9 built-in tools for searching, listing, and managing meeting data
- **Web search**: Grounded answers with inline citations
- **Multimodal**: Send images, audio, video, and documents
- **Speech input**: Voice-to-text for hands-free interaction
- **3-step orchestration**: Intent classification → programmatic retrieval → streaming synthesis

### 🔍 Meeting RAG (Retrieval-Augmented Generation)
- **Hybrid search**: Vector embeddings (KNN) + full-text search (FTS5) merged via Reciprocal Rank Fusion
- **Local embeddings**: Transformers.js with all-MiniLM-L6-v2 (384-dim, runs entirely in-browser)
- **Knowledge graph**: Entity extraction builds a graph of people, topics, decisions, and action items across meetings
- **Spotlight search**: Cmd+K instant search across all meetings and chats

### 📅 Calendar Integration
- macOS Calendar (EventKit) integration for upcoming meeting awareness
- Week view with event popovers

### 📋 Meeting Management
- **Transcription** with timestamps and speaker identification
- **Structured summaries** with key topics, decisions, and takeaways
- **Action items** automatically extracted and tracked as todos
- **Notes** per meeting
- **Todos** with priorities, due dates, reminders, and AI proposals
- **Import** audio files or transcripts from external sources

### 🔒 Privacy First
- **All data stays on your machine** — recordings, transcripts, summaries, and chat history stored locally
- API keys encrypted at rest (AES-256-GCM)
- No telemetry, no cloud storage, no data leaves your device (except API calls to your chosen AI provider)
- Optional fully-offline mode with local LLM + local embeddings

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS |
| **State** | React Context + Zustand |
| **UI Components** | Radix UI primitives, Lucide icons, Framer Motion |
| **AI** | Vercel AI SDK (@ai-sdk/*) |
| **Desktop** | Tauri 2.x (Rust) |
| **Audio** | Core Audio process tap, ScreenCaptureKit |
| **Search** | sqlite-vec (vector), FTS5 (full-text), Knowledge Graph |
| **Embeddings** | Transformers.js (all-MiniLM-L6-v2, WASM) |
| **Local LLM** | Any local OpenAI-compatible server (Ollama, LM Studio, llama.cpp server, vLLM, Jan) |
| **Calendar** | EventKit (macOS) |

## 📋 Requirements

- **macOS 26+ / iOS 26+ / iPadOS 26+** (Tahoe or later)
- **Apple Silicon** (M1 or later recommended)
- Node.js 20+
- Rust 1.77+
- Xcode Command Line Tools

## 🚀 Getting Started

### Prerequisites
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js 20+ (via nvm or similar)
nvm install 20
```

### Development
```bash
# Clone the repository
git clone https://github.com/pareekshithbompally/roci.git
cd roci

# Install dependencies
npm install

# Run the full Tauri app (recommended)
npm run tauri:dev

# Or run frontend only (no Tauri APIs)
npm run dev
```

### Build
```bash
# Production build (.dmg)
npm run tauri:build
```

### Testing
```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## 📁 Project Structure

```
roci/
├── src/
│   ├── app/              # App bootstrap
│   ├── features/         # 12 feature modules (chat, recording, history, etc.)
│   ├── shared/           # Shared contexts, hooks, components, utils
│   ├── core/ai/          # AI prompts, schemas, types
│   └── config/           # UI, theme, audio, shortcuts config
├── services/             # Business logic (AI routing, storage, repositories)
├── extensions/           # RAG, tools, orchestration, context pipeline
├── src-tauri/            # Rust backend (audio, window, plugins)
│   └── plugins/          # store, calendar
└── tests/                # Vitest + React Testing Library
```

## 🤝 Contributing

See [AGENTS.md](AGENTS.md) for detailed development guidelines, architecture overview, and code conventions.

## Acknowledgements

Roci is built on open-source software. Portions of Roci are derived from [Hex](https://github.com/anomalyco/hex) (MIT) and [Jan](https://github.com/janhq/jan) (Apache-2.0), and the app depends on projects including Tauri, React, the Vercel AI SDK and SQLite.

[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists every project with its licence and copyright notice, followed by the full licence texts. The same list is in the app under **Settings › General › Acknowledgements**.

All product names, logos and brands are property of their respective owners. They are used for identification only; their use does not imply endorsement.

## 📄 License

Roci is released under the [MIT License](LICENSE). Copyright © 2026 Pareekshith Bompally.
