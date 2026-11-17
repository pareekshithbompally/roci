// Open-source software Roci uses; the single source for Settings › Acknowledgements and THIRD_PARTY_NOTICES.md.

/** Trademark notice for the provider and app logos Roci shows. */
export const TRADEMARK_NOTICE =
  'All product names, logos and brands are property of their respective owners. They are used for identification only; their use does not imply endorsement.';

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
  /** Shown in THIRD_PARTY_NOTICES.md under the group title. */
  description?: string;
  items: readonly Acknowledgement[];
}

export const ACKNOWLEDGEMENTS: readonly AcknowledgementGroup[] = [
  {
    title: 'Derived code',
    description: 'Parts of Roci are derived from these projects.',
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
    items: [
      { name: 'Tauri and Tauri plugins', url: 'https://github.com/tauri-apps/tauri', license: 'Apache-2.0 OR MIT', text: 'MIT', copyright: 'Copyright (c) 2017 - Present Tauri Apps Contributors' },
      { name: 'React', url: 'https://github.com/facebook/react', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.' },
      { name: 'TanStack Query', url: 'https://github.com/TanStack/query', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2021-present Tanner Linsley' },
      { name: 'Zustand', url: 'https://github.com/pmndrs/zustand', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2019 Paul Henschel' },
      { name: 'Temporal Polyfill', url: 'https://github.com/fullcalendar/temporal-polyfill', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2024 Adam Shaw' },
    ],
  },
  {
    title: 'Interface',
    items: [
      { name: 'Radix UI Primitives', url: 'https://github.com/radix-ui/primitives', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2022 WorkOS' },
      { name: 'Lucide', url: 'https://github.com/lucide-icons/lucide', license: 'ISC', text: 'ISC', copyright: 'Copyright (c) Lucide Contributors 2025; portions Copyright (c) 2013-2023 Cole Bemis' },
      { name: 'Motion (Framer Motion)', url: 'https://github.com/motiondivision/motion', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2018 Framer B.V.' },
      { name: 'cmdk', url: 'https://github.com/pacocoursey/cmdk', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2022 Paco Coursey' },
      { name: 'Sonner', url: 'https://github.com/emilkowalski/sonner', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2023 Emil Kowalski' },
      { name: 'Schedule-X', url: 'https://github.com/schedule-x/schedule-x', license: 'MIT', text: 'MIT', copyright: 'Copyright 2023 Tom Österlund' },
      { name: 'React Resizable Panels', url: 'https://github.com/bvaughn/react-resizable-panels', license: 'MIT', text: 'MIT' },
      { name: 'use-stick-to-bottom', url: 'https://github.com/stackblitz/use-stick-to-bottom', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2024 - present StackBlitz' },
      { name: 'Streamdown', url: 'https://github.com/vercel/streamdown', license: 'Apache-2.0', text: 'Apache-2.0', copyright: 'Copyright 2023 Vercel, Inc.' },
      { name: 'remark-gfm and unist-util-visit', url: 'https://github.com/remarkjs/remark-gfm', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) Titus Wormer' },
      { name: 'highlight.js', url: 'https://github.com/highlightjs/highlight.js', license: 'BSD-3-Clause', text: 'BSD-3-Clause', copyright: 'Copyright (c) 2006, Ivan Sagalaev' },
      { name: 'wavesurfer.js', url: 'https://github.com/katspaugh/wavesurfer.js', license: 'BSD-3-Clause', text: 'BSD-3-Clause', copyright: 'Copyright (c) 2012-2023, katspaugh and contributors' },
      { name: 'React Simple Icons', url: 'https://github.com/icons-pack/react-simple-icons', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2019 Jorge Luis Calleja A.' },
      { name: 'Simple Icons', url: 'https://github.com/simple-icons/simple-icons', license: 'CC0-1.0' },
    ],
  },
  {
    title: 'AI and speech',
    items: [
      { name: 'Vercel AI SDK', url: 'https://github.com/vercel/ai', license: 'Apache-2.0', text: 'Apache-2.0', copyright: 'Copyright 2023 Vercel, Inc.' },
      { name: 'MLX Swift', url: 'https://github.com/ml-explore/mlx-swift', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2023 ml-explore' },
      { name: 'MLX Swift LM', url: 'https://github.com/ml-explore/mlx-swift-lm', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2024 ml-explore' },
      { name: 'swift-transformers', url: 'https://github.com/huggingface/swift-transformers', license: 'Apache-2.0', text: 'Apache-2.0' },
      { name: 'stable-diffusion.cpp', url: 'https://github.com/leejet/stable-diffusion.cpp', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2023 leejet' },
      { name: 'ONNX Runtime Web', url: 'https://github.com/microsoft/onnxruntime', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) Microsoft Corporation' },
      { name: 'Voice Activity Detection (vad-web)', url: 'https://github.com/ricky0123/vad', license: 'ISC', text: 'ISC' },
      { name: 'transcribe.cpp', url: 'https://github.com/handy-computer/transcribe.cpp', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2026 The transcribe.cpp authors' },
      { name: 'Phonon (ptts)', url: 'https://github.com/gradium-ai/xn-ptts', license: 'MIT OR Apache-2.0', text: 'MIT' },
      { name: 'MCP Rust SDK (rmcp)', url: 'https://github.com/modelcontextprotocol/rust-sdk', license: 'Apache-2.0', text: 'Apache-2.0', copyright: 'Copyright (c) 2024-2025 Model Context Protocol a Series of LF Projects, LLC.' },
    ],
  },
  {
    title: 'Audio, storage and system',
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
      { name: 'Qwen3 Embedding 0.6B', url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B', license: 'Apache-2.0', text: 'Apache-2.0' },
      {
        name: 'Parakeet Unified EN 0.6B',
        url: 'https://www.nvidia.com/en-us/agreements/enterprise-software/nvidia-open-model-license/',
        license: 'NVIDIA Open Model License',
        notice: 'Licensed by NVIDIA Corporation under the NVIDIA Open Model License.',
      },
      { name: 'Whisper Large V3 Turbo', url: 'https://huggingface.co/openai/whisper-large-v3-turbo', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2022 OpenAI' },
      { name: 'Phonon 31M and voices', url: 'https://huggingface.co/gradium/phonon-31m-en', license: 'Apache-2.0', text: 'Apache-2.0' },
      { name: 'Silero VAD', url: 'https://github.com/snakers4/silero-vad', license: 'MIT', text: 'MIT', copyright: 'Copyright (c) 2020-present Silero Team' },
    ],
  },
];
