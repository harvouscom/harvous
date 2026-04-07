/**
 * Publish Easter weekend thread into the existing Easter 2026 shared space.
 *
 * Prerequisites:
 * - .env: HARVOUS_ADMIN_SECRET, HARVOUS_SYSTEM_USER_ID
 * - Optional: EASTER_2026_SPACE_ID overrides publish-payload.json spaceId (same DB as your app)
 * - API running (default http://localhost:3001) or EASTER_PUBLISH_API_BASE
 *
 * Usage:
 *   npm run easter-weekend:publish
 *   npm run easter-weekend:publish -- --dry-run
 *   npm run easter-weekend:publish -- --validate-only
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
config({ path: resolve(root, '.env') });

const DOC_DIR = resolve(root, 'docs/easter-weekend-thread');
const PAYLOAD_PATH = resolve(DOC_DIR, 'publish-payload.json');
const NOTES_DIR = resolve(DOC_DIR, 'notes');
const NOTE_MAP_PATH = resolve(DOC_DIR, 'PUBLISHED_NOTE_MAP.json');
const MAX_NOTE_TITLE = 50;

interface Payload {
  spaceId: string;
  thread: { title: string; subtitle: string | null; color: string | null };
  notes: { title: string; contentFile: string; noteType: string }[];
}

function loadPayload(): Payload {
  const raw = readFileSync(PAYLOAD_PATH, 'utf-8');
  return JSON.parse(raw) as Payload;
}

function validatePayload(p: Payload) {
  if (!p.spaceId?.trim()) throw new Error('payload.spaceId required');
  if (!p.thread?.title?.trim()) throw new Error('payload.thread.title required');
  if (!Array.isArray(p.notes) || p.notes.length === 0) throw new Error('payload.notes required');

  for (const n of p.notes) {
    if (!n.title || n.title.length > MAX_NOTE_TITLE) {
      throw new Error(`Note title must be 1–${MAX_NOTE_TITLE} chars: "${n.title}" (${n.title?.length ?? 0})`);
    }
    if (!n.contentFile) throw new Error(`Missing contentFile for note "${n.title}"`);
    const fp = resolve(NOTES_DIR, n.contentFile);
    if (!existsSync(fp)) throw new Error(`Missing HTML file: ${fp}`);
    const html = readFileSync(fp, 'utf-8').trim();
    if (!html) throw new Error(`Empty HTML: ${n.contentFile}`);
    if (html.length > 50_000) throw new Error(`Content too long: ${n.contentFile}`);
  }
}

async function adminFetch(base: string, secret: string, path: string, init?: RequestInit) {
  const url = `${base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  const dryRun = args.includes('--dry-run');

  const payload = loadPayload();
  validatePayload(payload);

  if (validateOnly) {
    console.log('validate-only: OK — payload and note HTML files are valid.');
    return;
  }

  const secret = process.env.HARVOUS_ADMIN_SECRET;
  const spaceId = process.env.EASTER_2026_SPACE_ID?.trim() || payload.spaceId;
  const base = (process.env.EASTER_PUBLISH_API_BASE || 'http://localhost:3001').replace(/\/$/, '');

  if (dryRun) {
    console.log('dry-run: would POST to', base);
    console.log('spaceId:', spaceId);
    console.log('thread:', JSON.stringify(payload.thread));
    for (const n of payload.notes) {
      const html = readFileSync(resolve(NOTES_DIR, n.contentFile), 'utf-8');
      console.log('note:', n.title, `(${html.length} chars html)`);
    }
    console.log('dry-run: done (no requests sent).');
    return;
  }

  if (!secret) {
    console.error('HARVOUS_ADMIN_SECRET not set. Add to .env or export for this shell.');
    process.exit(1);
  }

  console.log('Creating thread in space', spaceId, '…');
  const threadRes = (await adminFetch(base, secret, `/api/admin/spaces/${encodeURIComponent(spaceId)}/threads`, {
    method: 'POST',
    body: JSON.stringify(payload.thread),
  })) as { thread?: { id: string } };

  const threadId = threadRes.thread?.id;
  if (!threadId) throw new Error('Unexpected thread response: ' + JSON.stringify(threadRes));
  console.log('Thread created:', threadId);

  const noteMap: Record<string, string> = {};
  for (const n of payload.notes) {
    const content = readFileSync(resolve(NOTES_DIR, n.contentFile), 'utf-8');
    console.log('Creating note:', n.title);
    const noteRes = (await adminFetch(base, secret, `/api/admin/threads/${encodeURIComponent(threadId)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ title: n.title, content, noteType: n.noteType || 'default' }),
    })) as { note?: { id: string } };
    if (!noteRes.note?.id) throw new Error('Unexpected note response: ' + JSON.stringify(noteRes));
    noteMap[n.contentFile] = noteRes.note.id;
    console.log(' →', noteRes.note.id);
  }

  const out = {
    _comment: 'Filled in by npm run easter-weekend:publish. Maps contentFile → note id for future sync.',
    spaceId,
    threadId,
    notes: noteMap,
  };
  writeFileSync(NOTE_MAP_PATH, JSON.stringify(out, null, 2) + '\n');

  console.log('\nDone. PUBLISHED_NOTE_MAP.json updated.');
  console.log(JSON.stringify({ spaceId, threadId, notes: noteMap }, null, 2));
  console.log(
    '\nAccess: Content is owned by HARVOUS_SYSTEM_USER_ID. Another Clerk user (e.g. your admin login) needs a Members row for this space — run: npm run harvous:grant-space-member (see script header), or join via the Easter space share link.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
