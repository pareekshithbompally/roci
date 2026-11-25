// Writes public/images/logos/<brand>.svg: every provider, maker and agent logo as one full square tile in its brand's own
// colours (LobeHub's AI icon set, MIT), plus Roci's own (the generic AI tile, this device) rendered by Icon Composer.
// Run with `npm run logos`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const SOURCE = new URL('docs/design/logo-tiles/', ROOT);
const OUT = new URL('public/images/logos/', ROOT);
const SIZE = 1024;
/** How much of the tile a mark takes. */
const INSET = 0.6;

type Fill = string | { angle: 45 | 135; stops: [string, number][] };
/** A brand's tile and mark colour; `colour` keeps a multicolour mark as drawn. */
const BRANDS: Record<string, { tile: Fill; ink: string | 'colour' }> = {
  openai: { tile: '#000000', ink: '#FFFFFF' },
  anthropic: { tile: '#F1F0E8', ink: '#141413' },
  gemini: { tile: '#FFFFFF', ink: 'colour' },
  gemma: { tile: { angle: 45, stops: [['#446EFF', 0.14], ['#2E96FF', 0.4], ['#B1C5FF', 0.73]] }, ink: '#FFFFFF' },
  groq: { tile: '#F55036', ink: '#FFFFFF' },
  ollama: { tile: '#FFFFFF', ink: '#000000' },
  mistral: { tile: '#FA520F', ink: '#FFFFFF' },
  openrouter: { tile: '#000000', ink: '#C8FF00' },
  lmstudio: { tile: { angle: 135, stops: [['#6C78EF', 0], ['#4F14BE', 1]] }, ink: '#FFFFFF' },
  vllm: { tile: '#FFFFFF', ink: 'colour' },
  elevenlabs: { tile: '#FFFFFF', ink: '#000000' },
  nvidia: { tile: '#74B71B', ink: '#FFFFFF' },
  liquid: { tile: '#FFFFFF', ink: '#000000' },
  qwen: { tile: '#082DFF', ink: '#FFFFFF' },
  meta: { tile: { angle: 45, stops: [['#007FF8', 0], ['#0668E1', 0.5], ['#007FF8', 1]] }, ink: '#FFFFFF' },
  deepseek: { tile: '#4D6BFE', ink: '#FFFFFF' },
  huggingface: { tile: '#FFFFFF', ink: 'colour' },
};

/** Logos with no mark in the set: their own art on a white tile (`fill`: art that is already a full square). */
const ART: Record<string, { file: string; fill?: boolean }> = {
  llamacpp: { file: 'llama-cpp.png', fill: true },
  jan: { file: 'jan.png' },
  sglang: { file: 'sglang.png' },
  deepgram: { file: 'deepgram.png' },
  hex: { file: 'hex.png' },
  server: { file: 'local-server.png' },
};

/** Roci's own tiles, rendered from their Icon Composer documents by Icon Composer's tool: the generic AI tile and this
 *  device. Written as WebP at the Settings pane icons' size. */
const ICONS: Record<string, string> = {
  ai: 'docs/design/logo-tiles/AI.icon',
  'device-mac': 'docs/design/pane-icons/device-laptop/device-laptop.icon',
  'device-ipad': 'docs/design/pane-icons/device-tablet/device-tablet.icon',
  'device-iphone': 'docs/design/pane-icons/device-phone/device-phone.icon',
};
const ICTOOL = '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool';
const ICON_PX = '240';

const tile = (fill: Fill, body: string) => {
  if (typeof fill === 'string') return svg(`<rect width="${SIZE}" height="${SIZE}" fill="${fill}"/>${body}`);
  const [x1, y1, x2, y2] = { 45: [0, 1, 1, 0], 135: [0, 0, 1, 1] }[fill.angle];
  const stops = fill.stops.map(([color, at]) => `<stop offset="${at}" stop-color="${color}"/>`).join('');
  return svg(`<defs><linearGradient id="t" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient></defs>`
    + `<rect width="${SIZE}" height="${SIZE}" fill="url(#t)"/>${body}`);
};
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>\n`;
const box = (inset: number) => {
  const side = SIZE * inset;
  return `x="${(SIZE - side) / 2}" y="${(SIZE - side) / 2}" width="${side}" height="${side}"`;
};

/** A mark's own <svg>, placed in the middle of the tile, its currentColor set to `ink`. */
function placedMark(file: string, ink: string): string {
  const source = readFileSync(new URL(`marks/${file}.svg`, SOURCE), 'utf8').replace(/<title>.*?<\/title>/, '');
  const open = source.match(/<svg[^>]*>/)?.[0] ?? '';
  const kept = open.replace(/\s(width|height|style)="[^"]*"/g, '').replace('<svg', `<svg ${box(INSET)}${ink === 'colour' ? '' : ` color="${ink}"`}`);
  return source.replace(open, kept);
}

function artTile(file: string, fill?: boolean): string {
  const data = readFileSync(new URL(`art/${file}`, SOURCE)).toString('base64');
  return tile('#FFFFFF', `<image href="data:image/png;base64,${data}" ${box(fill ? 1 : 0.64)} preserveAspectRatio="xMidYMid meet"/>`);
}

/** One Icon Composer document rendered to `<name>.webp`. */
function renderIcon(name: string, document: string): void {
  const png = fileURLToPath(new URL(`${name}.png`, OUT));
  execFileSync(ICTOOL, [fileURLToPath(new URL(document, ROOT)), '--export-image', '--output-file', png, '--platform', 'macOS',
    '--rendition', 'Default', '--width', ICON_PX, '--height', ICON_PX, '--scale', '1']);
  execFileSync('cwebp', ['-quiet', '-q', '90', png, '-o', fileURLToPath(new URL(`${name}.webp`, OUT))]);
  rmSync(png);
}

mkdirSync(OUT, { recursive: true });
const write = (name: string, content: string) => writeFileSync(new URL(`${name}.svg`, OUT), content);
const marks = new Set(readdirSync(new URL('marks/', SOURCE)).map((f) => f.replace(/\.svg$/, '')));
for (const [brand, { tile: fill, ink }] of Object.entries(BRANDS)) {
  if (!marks.has(brand)) throw new Error(`[build-logo-tiles] no mark for ${brand}`);
  write(brand, tile(fill, placedMark(brand, ink)));
}
for (const [name, { file, fill }] of Object.entries(ART)) write(name, artTile(file, fill));
for (const [name, document] of Object.entries(ICONS)) renderIcon(name, document);
console.log(`[build-logo-tiles] wrote ${Object.keys(BRANDS).length + Object.keys(ART).length + Object.keys(ICONS).length} tiles`);
