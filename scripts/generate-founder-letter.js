/**
 * Writes server/routes/founder-letter.inline.generated.ts from
 * src/data/about/founder-letter.md so the API bundle can include the letter
 * without runtime dynamic import (which fails in single-file Netlify deploy).
 * Run before build:api and at dev:api start.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const mdPath = path.join(root, 'src', 'data', 'about', 'founder-letter.md');
const outPath = path.join(root, 'server', 'routes', 'founder-letter.inline.generated.ts');

const md = fs.readFileSync(mdPath, 'utf-8');
const escaped = JSON.stringify(md);

const content = `/** Auto-generated from src/data/about/founder-letter.md - do not edit */\nexport default ${escaped};\n`;

fs.writeFileSync(outPath, content, 'utf-8');
console.log('Wrote', path.relative(root, outPath));
