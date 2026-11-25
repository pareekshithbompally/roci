// Writes THIRD_PARTY_NOTICES.md from src/config/acknowledgements.config.ts; run with `npm run notices`.
import { readFileSync, writeFileSync } from 'node:fs';
import { ACKNOWLEDGEMENTS, LICENSE_TEXT_IDS, TRADEMARKS, type Acknowledgement } from '../src/config/acknowledgements.config.ts';

const ROOT = new URL('../', import.meta.url);
const licenseText = (id: string) => readFileSync(new URL(`src/config/licenses/${id}.txt`, ROOT), 'utf8').trimEnd();

const licenseLine = (item: Acknowledgement) =>
  item.text && item.text !== item.license ? `- Licence: ${item.license} (used under ${item.text})` : `- Licence: ${item.license}`;

const entry = (item: Acknowledgement) =>
  `### ${item.name}\n\n` +
  [licenseLine(item), `- Source: <${item.url}>`, item.copyright && `- ${item.copyright}`, item.notice && `- ${item.notice}`]
    .filter(Boolean)
    .join('\n');

const sections = ACKNOWLEDGEMENTS.map((group) =>
  [`## ${group.title}`, group.description ?? '', ...group.items.map(entry)].filter(Boolean).join('\n\n'),
);

const texts = LICENSE_TEXT_IDS.map((id) => `### ${id}\n\n\`\`\`text\n${licenseText(id)}\n\`\`\``);

const document = [
  '# Third-Party Notices',
  "Roci includes or depends on the open-source software listed below. Each entry gives the project's licence and source, and its copyright notice where the project states one. The full licence texts follow the list.",
  'Where a project offers a choice of licences, the entry names the one Roci uses.',
  'This file is generated from `src/config/acknowledgements.config.ts` by `npm run notices`. Do not edit it by hand.',
  ...sections,
  '## Trademarks',
  ...TRADEMARKS,
  '## Licence texts',
  ...texts,
].join('\n\n');

writeFileSync(new URL('THIRD_PARTY_NOTICES.md', ROOT), `${document}\n`);
console.log('[generate-notices] wrote THIRD_PARTY_NOTICES.md');
