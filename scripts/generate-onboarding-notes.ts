/**
 * Generates src/utils/onboarding-notes.generated.ts from src/data/onboarding/*.md
 * so the API (dev and Netlify) has onboarding content without a runtime .md loader.
 * Run before build:api and at dev:api start (with generate-founder-letter).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { markdownToHtml } from '../src/utils/markdown-to-html';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'src', 'data', 'onboarding');
const outPath = path.join(root, 'src', 'utils', 'onboarding-notes.generated.ts');

const FILES = [
  { name: '01-welcome.md', order: 1 },
  { name: '02-create-organize.md', order: 2 },
  { name: '03-find.md', order: 3 },
  { name: '04-add-to-homescreen.md', order: 4 },
];

function parseMarkdownNote(markdown: string, order: number): { title: string; content: string; order: number } {
  const lines = markdown.split('\n');
  let title = '';
  let contentStartIndex = 0;

  if (lines[0]?.startsWith('# ')) {
    title = lines[0].substring(2).trim();
    contentStartIndex = 1;
  } else if (lines[0]?.startsWith('## ')) {
    title = lines[0].substring(3).trim();
    contentStartIndex = 1;
  } else {
    title = lines[0]?.trim() ?? '';
    contentStartIndex = 1;
  }

  const contentMarkdown = lines.slice(contentStartIndex).join('\n').trim();
  const content = markdownToHtml(contentMarkdown);

  return { title, content, order };
}

const notes: { title: string; content: string; order: number }[] = [];

for (const { name, order } of FILES) {
  const mdPath = path.join(dataDir, name);
  const md = fs.readFileSync(mdPath, 'utf-8');
  notes.push(parseMarkdownNote(md, order));
}

/** Bump when onboarding markdown meaningfully changes so existing users receive updates via sync. */
const ONBOARDING_PACK_VERSION = 2;

const lines: string[] = [
  '/** Auto-generated from src/data/onboarding/*.md - do not edit. Run: tsx scripts/generate-onboarding-notes.ts */',
  '',
  'export interface OnboardingNoteGenerated { title: string; content: string; order: number }',
  '',
  `export const ONBOARDING_PACK_VERSION = ${ONBOARDING_PACK_VERSION} as const;`,
  '',
  `export const onboardingNotesGenerated: OnboardingNoteGenerated[] = ${JSON.stringify(notes, null, 2)};`,
  '',
];

fs.writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log('Wrote', path.relative(root, outPath));
