<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Roci app icon">
</p>

<h1 align="center">Roci</h1>

<p align="center">Private meeting notes and AI chat for Mac, iPhone and iPad.</p>

<p align="center">
  <img alt="macOS · iOS · iPadOS" src="https://img.shields.io/badge/macOS%20%C2%B7%20iOS%20%C2%B7%20iPadOS-000000?logo=apple&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue">
</p>

<p align="center">
  <img src=".github/assets/home.png" alt="Roci's home: chat, recent meetings and Record" width="860">
</p>

## What it does

- **Records meetings.** On Mac, your microphone and the call's audio; on iPhone and iPad, the microphone. The transcript
  appears while you talk: word by word with a model that streams, every few seconds otherwise.
- **Transcribes and summarizes** with the speech and text models you pick: a summary, action items and to-dos, and your
  own notes filled in from what was said. Save a recording for later and summarize it when you want.
- **Chat.** Ask about your meetings, including the one you're recording, or about anything else, with any model you've
  added. Answers about meetings point back to the meeting and the moment. Add MCP servers, local or remote, to give chat
  more tools.
- **Dictation.** Speak instead of typing, with the same speech models; every dictation is kept.
- **Search by meaning.** Hybrid search (keywords plus vectors) over everything said, in the app's own database.
- **A knowledge graph that builds up over time.** Each meeting adds the people, organizations, projects and topics it
  discussed, and how they relate, so links between meetings are there when you need them.
- **Tracks what AI costs.** Every call is logged with its tokens or audio minutes and priced from models.dev, or from your
  own price. Usage shows cost by model, by use and over time.
- **Calendar.** Upcoming meetings, a reminder before each one, and a Record button in it.
- **Tools.** Web search and image generation with cloud models. Coding agents can connect to Roci's own MCP server to
  use Roci's tools.

<p align="center">
  <img src=".github/assets/meeting.png" alt="A meeting in Roci: transcript beside the AI summary" width="860">
</p>

## Models: on the device, on your server, or in the cloud

| Where | What runs there |
|---|---|
| **On this device** | Chat and meeting-search embeddings on [llama.cpp](https://github.com/ggml-org/llama.cpp). Speech recognition with [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp) (Parakeet, Nemotron, Whisper, Indic Transcribe Flex for 27 Indian languages). Read aloud with a voice model or the system voices. Apple Intelligence and Apple Speech. Nothing leaves the device and nothing is charged. |
| **Your own server** | Any OpenAI-compatible server on your network: Ollama, LM Studio, Jan, llama.cpp. |
| **Cloud** | OpenAI, Anthropic, Google Gemini, OpenRouter, Mistral, Groq, Deepgram and ElevenLabs, with your own API key. |

What each model can do (text, images, audio in and out) and its price come from [models.dev](https://models.dev), with a
small built-in list for models it doesn't cover yet.

<p align="center">
  <img src=".github/assets/providers.png" alt="Settings › Providers" width="860">
</p>

## Personalization

Your own instructions and saved prompts, a memory of what you've told it, a vocabulary of names and terms the speech models
should hear right, and tuning for the models you run.

<p align="center">
  <img src=".github/assets/personalization.png" alt="Settings › Personalization" width="860">
</p>

## Privacy

There is no account, no Roci server and no sync. Meetings, chats, recordings and settings are kept in one SQLite database
on your device; API keys are encrypted in it with a key held in the macOS Keychain. Audio and text go only to the models you
choose.

## What it doesn't do

- It doesn't join calls as a bot. It records on your device.
- On iPhone and iPad it records the microphone only.
- Mac only: menu bar, call detection, call audio, Spotlight, Apple Notes, local servers and local MCP servers.

## Built with

Tauri 2 (Rust core, native macOS audio capture through Core Audio taps), React 19 and TypeScript, the Vercel AI SDK for
every model call, Zustand and TanStack Query for state, Tailwind and Radix for the interface, SQLite with sqlite-vec and
GraphQLite for search and the graph, and Swift plugins for Apple Intelligence, calendar, notifications and Spotlight.

Roci is built with the help of AI coding agents. Portions of the code are ported from [Jan](https://github.com/janhq/jan) and [Hex](https://github.com/anomalyco/hex),
under their licences (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

## Download

The latest Mac app is on the [Releases](https://github.com/pareekshithbompally/roci/releases/latest) page. It needs macOS 26
or later on Apple silicon.

## Build from source

See [BUILDING.md](BUILDING.md) for what to install and how to build, run and test it.

## Contributing

Roci is a personal project that I share as-is. **I'm not able to take on issues or pull requests**, but you're welcome to fork it and make it your own.

## License

MIT. See [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and [TRADEMARK.md](TRADEMARK.md) for the
name and icon. Security reports: [SECURITY.md](.github/SECURITY.md).
