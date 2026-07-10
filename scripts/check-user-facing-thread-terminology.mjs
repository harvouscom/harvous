import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const ACTIVE_ROOTS = [
  'spa/src',
  'src',
  'server',
  'e2e',
  'native/Harvous',
  'help',
  'release-notes',
];
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.swift',
  '.md',
  '.html',
]);
const RETIRED_LABEL =
  /\b(?:group\s+study\s+threads?|study\s+threads?)\b/gi;

function filesUnder(path) {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'coverage'
    ) {
      return [];
    }
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function preserveLinesWithSpaces(value) {
  return value.replace(/[^\n]/g, ' ');
}

function userFacingSource(source, extension) {
  if (extension === '.md' || extension === '.html') return source;

  // Internal identifiers and API paths do not contain the retired label with
  // spaces. Strip comments and regex assertions while preserving line numbers;
  // JSX text, accessibility props, literals, errors, and Swift strings remain.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, preserveLinesWithSpaces)
    .replace(/^\s*\/\/.*$/gm, preserveLinesWithSpaces)
    .replace(
      /\/(?:\\.|[^/\n])+\/[dgimsuvy]*/g,
      preserveLinesWithSpaces,
    );
}

const files = ACTIVE_ROOTS.flatMap((path) =>
  filesUnder(resolve(ROOT, path)),
).filter((path) => SOURCE_EXTENSIONS.has(extname(path)));

const failures = [];
for (const file of files) {
  const extension = extname(file);
  const source = userFacingSource(readFileSync(file, 'utf8'), extension);
  for (const match of source.matchAll(RETIRED_LABEL)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${relative(ROOT, file)}:${line}: ${match[0]}`);
  }
}

if (failures.length > 0) {
  console.error(
    [
      'User-facing Thread terminology check failed.',
      'Use “Thread” or “Threads” as the feature label:',
      ...failures.map((failure) => `- ${failure}`),
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  console.log(
    `User-facing Thread terminology check passed (${files.length} active files scanned).`,
  );
}
