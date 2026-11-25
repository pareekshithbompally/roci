// Open-source software Roci uses; the single source for Settings › Acknowledgements and THIRD_PARTY_NOTICES.md.

/** Settings › General › Acknowledgements. */
export const ACKNOWLEDGEMENTS_COPY = {
  title: 'Acknowledgements',
  licences: 'Licences',
  trademarks: 'Trademarks',
  licence: 'Licence',
  openWebsite: 'Open Website',
} as const;

/** Trademark notice for every name and logo Roci shows: the end of About and the top of Acknowledgements, one paragraph each. */
export const TRADEMARKS: readonly string[] = [
  'Apple, the Apple logo, Apple Intelligence, Mac, macOS, iPhone, iPad, iOS and iPadOS are trademarks of Apple Inc., '
    + 'registered in the U.S. and other countries and regions.',
  'Google, Gemini and Gemma are trademarks of Google LLC. OpenAI, ChatGPT and Codex are trademarks of OpenAI. Claude and '
    + 'Claude Code are trademarks of Anthropic, PBC. Meta and Llama are trademarks of Meta Platforms, Inc. NVIDIA and '
    + 'Nemotron are trademarks of NVIDIA Corporation. Qwen is a trademark of Alibaba Group. Mistral AI is a trademark of '
    + 'Mistral AI SAS. DeepSeek is a trademark of DeepSeek. Hugging Face is a trademark of Hugging Face, Inc.',
  'All other product names, logos and brands are the property of their respective owners.',
  'Roci is an independent app. It is not affiliated with, sponsored by or endorsed by any of these companies. Their names '
    + 'and logos are used only to identify their products and services, and Roci claims no ownership of them.',
];

/** Licences whose full text ships with Roci (src/config/licenses/<id>.txt). */
export const LICENSE_TEXT_IDS = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'] as const;
export type LicenseTextId = (typeof LICENSE_TEXT_IDS)[number];

export interface Acknowledgement {
  name: string;
  url: string;
  /** SPDX expression or licence name, as the project states it. */
  license: string;
  /** Full text to show; omitted for public-domain, CC0 and model licences linked by `url`. */
  text?: LicenseTextId;
  copyright?: string;
  /** Attribution the licence asks to be reproduced verbatim. */
  notice?: string;
}

export interface AcknowledgementGroup {
  title: string;
  /** The group's section footer in Settings, and its line under the title in THIRD_PARTY_NOTICES.md. */
  description?: string;
  items: readonly Acknowledgement[];
}

export const ACKNOWLEDGEMENTS: readonly AcknowledgementGroup[] = [
  {
    title: 'Hex and Jan',
    description: "Parts of Roci's code come from these open-source apps, used under their licences.",
    items: [
      { name: 'Hex', url: 'https://github.com/anomalyco/hex', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2026 Christopher Langton' },
      {
        name: 'Jan',
        url: 'https://github.com/janhq/jan',
        license: 'Apache-2.0',
        text: 'Apache-2.0',
        copyright: 'Copyright 2025 Menlo Research',
        notice: 'This product includes software developed by Menlo Research (https://menlo.ai).',
      },
    ],
  },
  {
    title: 'Application framework',
    description: "Roci's app shell on macOS and iOS, its state and its data checks.",
    items: [
      { name: 'Tauri and Tauri plugins', url: 'https://github.com/tauri-apps/tauri', license: 'Apache-2.0 OR MIT', text: 'MIT', copyright: 'Copyright (c) 2017 - Present Tauri Apps Contributors' },
      { name: 'React', url: 'https://github.com/facebook/react', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.' },
      { name: 'TanStack Query and Table', url: 'https://github.com/TanStack/query', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2016-present Tanner Linsley' },
      { name: 'Zustand', url: 'https://github.com/pmndrs/zustand', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2019 Paul Henschel' },
      { name: 'Zod', url: 'https://github.com/colinhacks/zod', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2025 Colin McDonnell' },
      { name: 'Temporal Polyfill', url: 'https://github.com/fullcalendar/temporal-polyfill', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2024 Adam Shaw' },
    ],
  },
  {
    title: 'Interface',
    description: 'Controls, icons, animation, chat formatting, charts, the knowledge graph and audio waveforms.',
    items: [
      { name: 'Radix UI Primitives', url: 'https://github.com/radix-ui/primitives', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2022 WorkOS' },
      { name: 'Lucide', url: 'https://github.com/lucide-icons/lucide', license: 'ISC', text: 'ISC', copyright: 'Copyright (c) Lucide Contributors 2025; portions Copyright (c) 2013-2023 Cole Bemis' },
      { name: 'Motion (Framer Motion)', url: 'https://github.com/motiondivision/motion', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2018 Framer B.V.' },
      { name: 'react-modal-sheet', url: 'https://github.com/Temzasse/react-modal-sheet', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2020 Teemu Taskula' },
      { name: 'cmdk', url: 'https://github.com/pacocoursey/cmdk', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2022 Paco Coursey' },
      { name: 'Sonner', url: 'https://github.com/emilkowalski/sonner', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2023 Emil Kowalski' },
      { name: 'React Resizable Panels', url: 'https://github.com/bvaughn/react-resizable-panels', license: 'MIT', text: 'MIT' },
      { name: 'use-stick-to-bottom', url: 'https://github.com/stackblitz/use-stick-to-bottom', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2024 - present StackBlitz' },
      { name: 'Streamdown', url: 'https://github.com/vercel/streamdown', license: 'Apache-2.0', text: 'Apache-2.0', copyright: 'Copyright 2023 Vercel, Inc.' },
      { name: 'remark-gfm', url: 'https://github.com/remarkjs/remark-gfm', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) Titus Wormer' },
      { name: 'highlight.js', url: 'https://github.com/highlightjs/highlight.js', license: 'BSD-3-Clause', text: 'BSD-3-Clause', copyright: 'Copyright (c) 2006, Ivan Sagalaev' },
      { name: 'KaTeX', url: 'https://github.com/KaTeX/KaTeX', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2013-2020 Khan Academy and other contributors' },
      { name: 'Mermaid', url: 'https://github.com/mermaid-js/mermaid', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2014 - 2022 Knut Sveidqvist' },
      {
        name: 'Apache ECharts',
        url: 'https://github.com/apache/echarts',
        license: 'Apache-2.0',
        text: 'Apache-2.0',
        copyright: 'Copyright 2017-2026 The Apache Software Foundation',
        notice: 'This product includes software developed at The Apache Software Foundation (https://www.apache.org/).',
      },
      { name: 'sigma.js', url: 'https://github.com/jacomyal/sigma.js', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2012-2026 Alexis Jacomy, Guillaume Plique, Benoît Simard' },
      { name: 'graphology', url: 'https://github.com/graphology/graphology', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2016-2021 Guillaume Plique (Yomguithereal)' },
      { name: 'wavesurfer.js', url: 'https://github.com/katspaugh/wavesurfer.js', license: 'BSD-3-Clause', text: 'BSD-3-Clause', copyright: 'Copyright (c) 2012-2023, katspaugh and contributors' },
      { name: 'React Simple Icons', url: 'https://github.com/icons-pack/react-simple-icons', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2019 Jorge Luis Calleja A.' },
      { name: 'Simple Icons', url: 'https://github.com/simple-icons/simple-icons', license: 'CC0-1.0' },
      { name: 'LobeHub Icons', url: 'https://github.com/lobehub/lobe-icons', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2023 LobeHub' },
    ],
  },
  {
    title: 'AI and speech',
    description: 'Calling AI providers, running models on this device, transcribing speech and serving tools to coding agents.',
    items: [
      { name: 'Vercel AI SDK', url: 'https://github.com/vercel/ai', license: 'Apache-2.0', text: 'Apache-2.0', copyright: 'Copyright 2023 Vercel, Inc.' },
      { name: 'llama.cpp', url: 'https://github.com/ggml-org/llama.cpp', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2023-2026 The ggml authors' },
      { name: 'transcribe.cpp', url: 'https://github.com/handy-computer/transcribe.cpp', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2026 The transcribe.cpp authors' },
      { name: 'MCP Rust SDK (rmcp)', url: 'https://github.com/modelcontextprotocol/rust-sdk', license: 'Apache-2.0', text: 'Apache-2.0', copyright: 'Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC.' },
    ],
  },
  {
    title: 'Audio, storage and system',
    description: 'Recording audio, the roci.db database with its search and knowledge graph, and talking to macOS.',
    items: [
      { name: 'cpal', url: 'https://github.com/RustAudio/cpal', license: 'Apache-2.0', text: 'Apache-2.0' },
      { name: 'screencapturekit-rs', url: 'https://github.com/doom-fish/screencapturekit-rs', license: 'MIT OR Apache-2.0', text: 'MIT', copyright: 'Copyright (c) 2023 Per Johansson, Svt Labs' },
      { name: 'objc2', url: 'https://github.com/madsmtm/objc2', license: 'MIT', text: 'MIT' },
      { name: 'core-foundation-rs', url: 'https://github.com/servo/core-foundation-rs', license: 'MIT OR Apache-2.0', text: 'MIT', copyright: 'Copyright (c) 2012-2013 Mozilla Foundation' },
      { name: 'Rubato', url: 'https://github.com/HEnquist/rubato', license: 'MIT OR Apache-2.0', text: 'MIT', copyright: 'Copyright (c) 2020 Henrik Enquist' },
      { name: 'Hound', url: 'https://github.com/ruuda/hound', license: 'Apache-2.0', text: 'Apache-2.0' },
      { name: 'SQLite', url: 'https://sqlite.org', license: 'Public domain' },
      { name: 'rusqlite', url: 'https://github.com/rusqlite/rusqlite', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2014-2021 The rusqlite developers' },
      { name: 'sqlite-vec', url: 'https://github.com/asg017/sqlite-vec', license: 'MIT OR Apache-2.0', text: 'MIT' },
      { name: 'GraphQLite', url: 'https://github.com/colliery-io/graphqlite', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2025 GraphQLite Contributors' },
      { name: 'Tokio', url: 'https://github.com/tokio-rs/tokio', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) Tokio Contributors' },
      { name: 'reqwest', url: 'https://github.com/seanmonstar/reqwest', license: 'MIT OR Apache-2.0', text: 'MIT', copyright: 'Copyright (c) 2016 Sean McArthur' },
      { name: 'Serde', url: 'https://github.com/serde-rs/serde', license: 'MIT OR Apache-2.0', text: 'MIT' },
      { name: 'eyre', url: 'https://github.com/eyre-rs/eyre', license: 'MIT OR Apache-2.0', text: 'MIT' },
    ],
  },
  {
    title: 'Models (downloaded on request)',
    description: 'Roci downloads these from Hugging Face only when you choose to use them.',
    items: [
      { name: 'Gemma 4 E2B', url: 'https://huggingface.co/google/gemma-4-E2B-it', license: 'Apache-2.0', text: 'Apache-2.0' },
      { name: 'Gemma 4 E4B', url: 'https://huggingface.co/google/gemma-4-E4B-it', license: 'Apache-2.0', text: 'Apache-2.0' },
      {
        name: 'LFM3 Omni 2B',
        url: 'https://huggingface.co/LiquidAI/LFM3-Omni-2B',
        license: 'LFM Open License v1.0',
        notice: 'LFM3 Omni 2B by Liquid AI, under the LFM Open License v1.0.',
      },
      {
        name: 'Nemotron 3.5 Bolt E4B',
        url: 'https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB',
        license: 'OpenMDW 1.1',
        notice: 'Nemotron 3.5 Bolt E4B by NVIDIA, under the OpenMDW License 1.1.',
      },
      { name: 'Qwen3 Embedding 0.6B', url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B', license: 'Apache-2.0', text: 'Apache-2.0' },
      {
        name: 'Parakeet Unified EN 0.6B',
        url: 'https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/',
        license: 'NVIDIA Open Model License',
        notice: 'Licensed by NVIDIA Corporation under the NVIDIA Open Model License.',
      },
      { name: 'Whisper Large V3 Turbo', url: 'https://huggingface.co/openai/whisper-large-v3-turbo', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2022 OpenAI' },
      {
        name: 'Indic-Transcribe-Flex',
        url: 'https://huggingface.co/bodhan-ai/indic-transcribe-flex',
        license: 'Indic Open Model License v1.0',
        notice: 'Built with Indic-Transcribe-Flex from Bodhan AI / AI4Bharat. Built on NVIDIA Canary 1B v2, CC-BY-4.0.',
      },
      { name: 'Chatterbox Turbo', url: 'https://huggingface.co/ResembleAI/chatterbox-turbo', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2025 Resemble AI' },
      { name: 'Soprano 1.1', url: 'https://huggingface.co/ekwek/Soprano-1.1-80M', license: 'Apache-2.0', text: 'Apache-2.0' },
      { name: 'Silero VAD', url: 'https://github.com/snakers4/silero-vad', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2020-present Silero Team' },
    ],
  },
];
