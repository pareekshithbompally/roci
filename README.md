<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Roci app icon">
</p>

<h1 align="center">Roci</h1>

<p align="center">Private meeting notes and AI chat for Mac, iPhone and iPad.</p>

## What Roci does

- **Records meetings.** On Mac, the microphone and the other people on the call. On iPhone and iPad, the microphone.
- **Transcribes and summarizes.** Overview, action items and to-dos, with the speech and AI models you choose.
- **Chats with your meetings.** Ask about anything said in past meetings, with answers that point to the source.
- **Works with your calendar.** Shows upcoming meetings and reminds you before they start, with a Record button.
- **Runs on your device when you want it to.** Apple Intelligence, plus downloadable models for chat, speech recognition, read aloud and meeting search, with nothing leaving the device.
- **Connects to the AI you already use.** OpenAI, Anthropic, Google Gemini, Mistral, Groq and others with your own key, or a local server (Ollama, LM Studio, Jan).
- **Uses tools.** Web search, image generation with cloud models, and MCP servers.

Your meetings, chats and keys are stored only on your device.

## What Roci does not do

- No account, no cloud storage, no sync between devices.
- It does not join calls as a bot. It records on your device.
- On iPhone and iPad, it records your microphone only.
- Some features are Mac-only: menu bar, call detection, call audio, Spotlight, Apple Notes, local AI servers and local MCP servers.

## Requirements

- macOS 26, iOS 26 or iPadOS 26, on Apple silicon.
- To build: Xcode 26 with its Metal Toolchain, Rust, and Node.js 22.

## Build from source

```bash
git clone https://github.com/pareekshithbompally/roci.git
cd roci
npm install
npm run tauri:dev      # run on Mac
npm run tauri:build    # build the Mac app
npm test               # run the tests
```

## Contributing

Roci is a personal project that I share as-is. I'm not able to take on issues or pull requests, but you're very welcome to fork it and make it your own.

## License

MIT. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
