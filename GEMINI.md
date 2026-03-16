# Kasset AI - Developer & AI Agent Context

This `GEMINI.md` file provides essential context for AI agents and developers working on the **Kasset AI** project.

## Project Overview

**Kasset AI** is a macOS meeting intelligence application. It is designed to be private and local-first, featuring real-time audio capture, meeting transcription, and a built-in general-purpose AI chat. It supports multiple AI providers (OpenAI, Anthropic, Gemini, local Llama.cpp, etc.) and uses local vector search (sqlite-vec) for Meeting RAG. All data, including recordings and transcripts, stays on the user's machine.

**Tech Stack:**
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Zustand, Radix UI
- **Backend:** Tauri 2.x, Rust (1.77+)
- **OS:** macOS 15.0+ (Apple Silicon M1+)
- **Audio:** ScreenCaptureKit (native macOS API for system + mic audio)
- **Database/Local AI:** `tauri-plugin-vectordb` (sqlite-vec) and `tauri-plugin-llamacpp`

## Project Architecture

The project is structured into a frontend React application and a backend Tauri Rust application.

```
kasset-ai/
├── src/                # Modern React frontend (USE THIS)
│   ├── app/            # App bootstrap (App.tsx, AppProviders.tsx)
│   ├── features/       # Feature modules (chat, recording, etc.)
│   ├── shared/         # Cross-feature contexts, hooks, utils
│   └── config/         # App configuration (ui, audio, etc.)
├── services/           # Business logic layer (AI unified routing, API adapters, Tauri bridging)
├── tests/              # Vitest + React Testing Library tests
├── src-tauri/          # Rust backend
│   ├── src/            # Core Rust code (audio_core.rs, window.rs)
│   └── plugins/        # Custom Tauri plugins (vectordb, llamacpp)
└── scripts/            # Build helpers
```

**Note on Legacy Folders:** Folders like `/components/`, `/hooks/`, `/utils/`, and `/consts/` in the root are considered legacy. New development should occur within `src/features/` or `src/shared/`.

## Building and Running

**Prerequisites:** Node.js 20+, Rust 1.77+, Xcode Command Line Tools (`xcode-select --install`).

*   **Development Server (Frontend + Backend):** `npm run tauri:dev` (Recommended for full app testing)
*   **Development Server (Frontend Only):** `npm run dev`
*   **Production Build:** `npm run tauri:build` (Outputs `.dmg`)
*   **Testing:**
    *   Run all tests: `npm test`
    *   Watch mode: `npm run test:watch`
    *   Coverage: `npm run test:coverage`

## Development Conventions

### TypeScript & Code Style
- **Strict TypeScript:** Avoid `any` (use `unknown` if necessary). Use `interface` for public APIs and `type` for unions/intersections. Always use type-only imports (`import type { ... }`).
- **Path Aliases:** NEVER use relative paths like `../../../`. Use configured aliases: `@/*`, `@app/*`, `@features/*`, `@shared/*`, `@config/*`, etc.
- **Styling:** Use Tailwind CSS exclusively. No CSS modules or inline styles. Use predefined constants from `UI_CONFIG` (e.g., from `src/config/ui.config.ts`).
- **Feature Modules:** When working within `src/features/`, always import from the feature's `index.ts` file, not from internal feature files.
- **Naming:** 
    - Components: PascalCase (`SettingsPanel`)
    - Hooks: camelCase with `use` prefix (`useApp`)
    - Services: camelCase with `Service` suffix (`unifiedAIService`)

### Cross-Origin Resource Sharing (CORS)
- Browser `fetch()` often causes CORS failures with AI providers.
- **CRITICAL:** Do NOT override `globalThis.fetch`.
- HTTP requests to AI providers are routed through Tauri's Rust-based `plugin-http` (using `reqwest`) to bypass browser CORS restrictions. This is handled in `services/platform-fetch.ts` and the various provider adapters.

### Testing Practices
- **Framework:** Vitest + React Testing Library (with `jsdom`).
- Ensure all business logic and UI components have adequate test coverage.

### Contexts & State
- State is managed via React Contexts (in `src/shared/contexts/`) and Zustand.
- Key contexts: `AppContext`, `SettingsContext`, `HistoryContext`, `MeetingContext`, `ChatContext`.

For full, detailed guidelines, always refer to the `AGENTS.md` and `README.md` files located in the root directory.
