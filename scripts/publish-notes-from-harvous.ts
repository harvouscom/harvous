/**
 * Publish Notes from Harvous curated space via Harvous Admin API.
 *
 * Prerequisites:
 * - Human sign-off: docs/notes-from-harvous/SIGNOFF.txt (gitignored), first line APPROVED_FOR_PUBLISH
 * - .env: HARVOUS_ADMIN_SECRET, HARVOUS_SYSTEM_USER_ID
 * - API running (default http://localhost:3001) or NOTES_FROM_HARVOUS_PUBLISH_API_BASE
 *
 * Usage:
 *   npm run notes-from-harvous:publish -- --validate-only
 *   npm run notes-from-harvous:publish -- --dry-run
 *   npm run notes-from-harvous:publish -- --preflight
 *   npm run notes-from-harvous:publish
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
config({ path: resolve(root, '.env') });

const DOC_DIR = resolve(root, 'docs/notes-from-harvous');
const SIGNOFF_PATH = resolve(DOC_DIR, 'SIGNOFF.txt');
const PAYLOAD_PATH = resolve(DOC_DIR, 'publish-payload.json');
const NOTES_DIR = resolve(DOC_DIR, 'notes');
const MAX_NOTE_TITLE = 50;

interface Payload {
  space: { title: string; description: string | null; color: string; isFeatured?: boolean };
  thread: { title: string; subtitle: string | null; color: string | null };
  notes: { title: string; contentFile: string; noteType: string }[];
  featured?: {
    enabled: boolean;
    contentType: string;
    title: string;
    description: string | null;
    color: string | null;
    isActive: boolean;
  };
}

function loadPayload(): Payload {
  return JSON.parse(readFileSync(PAYLOAD_PATH, 'utf-8')) as Payload;
}

function readSignoff(): string {
  if (!existsSync(SIGNOFF_PATH)) {
    throw new Error(
      `Missing ${SIGNOFF_PATH}. After human approval, copy SIGNOFF.template.txt to SIGNOFF.txt and set line 1 to APPROVED_FOR_PUBLISH.`,
    );
  }
  return readFileSync(SIGNOFF_PATH, 'utf-8').trim();
}

function assertSignoffApproved(signoff: string) {
  const first = signoff.split(/\r?\n/)[0]?.trim();
  if (first !== 'APPROVED_FOR_PUBLISH') {
    throw new Error(
      `SIGNOFF.txt first line must be exactly "APPROVED_FOR_PUBLISH" (got "${first ?? ''}"). See docs/notes-from-harvous/APPROVAL.md.`,
    );
  }
}

function validatePayload(p: Payload) {
  if (!p.space?.title?.trim()) throw new Error('payload.space.title required');
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
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate-only');
  const dryRun = args.includes('--dry-run');
  const noFeatured = args.includes('--no-featured');
  const preflight = args.includes('--preflight');

  const payload = loadPayload();
  validatePayload(payload);

  if (validateOnly) {
    console.log('validate-only: OK — payload and note HTML files are valid.');
    return;
  }

  const secret = process.env.HARVOUS_ADMIN_SECRET;
  const base = (process.env.NOTES_FROM_HARVOUS_PUBLISH_API_BASE || 'http://localhost:3001').replace(
    /\/$/,
    '',
  );

  if (preflight) {
    if (!secret) {
      console.error('preflight: HARVOUS_ADMIN_SECRET not set in environment (.env).');
      process.exit(2);
    }
    try {
      await adminFetch(base, secret, '/api/admin/check');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        console.error(`preflight: cannot reach API at ${base}. Start it with: npm run dev:api`);
        process.exit(1);
      }
      throw e;
    }
    console.log('preflight: GET /api/admin/check OK');
    return;
  }

  if (dryRun) {
    console.log('dry-run: would POST to', base);
    console.log('space:', JSON.stringify(payload.space));
    console.log('thread:', JSON.stringify(payload.thread));
    for (const n of payload.notes) {
      const html = readFileSync(resolve(NOTES_DIR, n.contentFile), 'utf-8');
      console.log('note:', n.title, `(${html.length} chars html)`);
    }
    if (!noFeatured && payload.featured?.enabled) {
      console.log('featured:', JSON.stringify({ ...payload.featured, shareToken: '<after space create>' }));
    }
    console.log('dry-run: done (no requests sent).');
    return;
  }

  if (!secret) {
    console.error('HARVOUS_ADMIN_SECRET not set. Add to .env or export for this shell.');
    process.exit(1);
  }

  assertSignoffApproved(readSignoff());

  console.log('Creating space…');
  const spaceRes = (await adminFetch(base, secret, '/api/admin/spaces', {
    method: 'POST',
    body: JSON.stringify(payload.space),
  })) as { space?: { id: string; shareToken?: string }; joinUrl?: string };

  const space = spaceRes.space;
  if (!space?.id) throw new Error('Unexpected space response: ' + JSON.stringify(spaceRes));

  const joinUrl = spaceRes.joinUrl ?? '';
  const shareToken = space.shareToken ?? '';

  console.log('Creating thread…');
  const threadRes = (await adminFetch(base, secret, `/api/admin/spaces/${encodeURIComponent(space.id)}/threads`, {
    method: 'POST',
    body: JSON.stringify(payload.thread),
  })) as { thread?: { id: string } };

  const threadId = threadRes.thread?.id;
  if (!threadId) throw new Error('Unexpected thread response: ' + JSON.stringify(threadRes));

  const noteIds: string[] = [];
  for (const n of payload.notes) {
    const content = readFileSync(resolve(NOTES_DIR, n.contentFile), 'utf-8');
    console.log('Creating note:', n.title);
    const noteRes = (await adminFetch(base, secret, `/api/admin/threads/${encodeURIComponent(threadId)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ title: n.title, content, noteType: n.noteType || 'default' }),
    })) as { note?: { id: string } };
    if (!noteRes.note?.id) throw new Error('Unexpected note response: ' + JSON.stringify(noteRes));
    noteIds.push(noteRes.note.id);
  }

  let featuredItemId: string | null = null;
  if (!noFeatured && payload.featured?.enabled && shareToken) {
    console.log('Creating featured item…');
    const feat = payload.featured;
    const featRes = (await adminFetch(base, secret, '/api/admin/featured', {
      method: 'POST',
      body: JSON.stringify({
        contentType: feat.contentType,
        title: feat.title,
        description: feat.description,
        shareToken,
        color: feat.color,
        isActive: feat.isActive ?? true,
      }),
    })) as { id?: string };
    featuredItemId = featRes.id ?? null;
  }

  console.log('\nDone. Copy into marketing.context.md:\n');
  console.log(
    JSON.stringify(
      {
        publishedAt: new Date().toISOString(),
        spaceId: space.id,
        threadId,
        joinUrl,
        shareToken,
        noteIds,
        featuredItemId,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
