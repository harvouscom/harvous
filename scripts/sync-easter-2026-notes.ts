/**
 * Push revised Easter 2026 note HTML from the repo into existing Supabase rows,
 * then run processScriptureReferences for each note (admin POST does not).
 *
 * Requires: .env with SUPABASE_DATABASE_URL, HARVOUS_SYSTEM_USER_ID
 *
 * Usage:
 *   npm run easter:sync-notes -- --dry-run
 *   npm run easter:sync-notes
 *   npm run easter:sync-notes -- --skip-scripture
 *
 * Optional env:
 *   EASTER_SYNC_THREAD_ID — override thread id (default: PUBLISHED_NOTE_MAP.json or thread_1775233361457)
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, Notes, NoteThreads, eq, and, first } from '../server/db';
import { nowISO } from '../server/db/dates';
import { getHarvousSystemUserId } from '../server/utils/harvous-admin';
import { processScriptureReferences } from '../server/utils/process-scripture-references';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const DOC_DIR = resolve(root, 'docs/easter-2026-shared-space');
const PAYLOAD_PATH = resolve(DOC_DIR, 'publish-payload.json');
const MAP_PATH = resolve(DOC_DIR, 'PUBLISHED_NOTE_MAP.json');
const NOTES_DIR = resolve(DOC_DIR, 'notes');
const MAX_NOTE_TITLE = 50;

interface Payload {
  notes: { title: string; contentFile: string; noteType: string }[];
}

interface NoteMapFile {
  threadId?: string;
  notes: Record<string, string>;
}

function loadPayload(): Payload {
  const raw = readFileSync(PAYLOAD_PATH, 'utf-8');
  return JSON.parse(raw) as Payload;
}

function loadMap(): NoteMapFile {
  const raw = readFileSync(MAP_PATH, 'utf-8');
  return JSON.parse(raw) as NoteMapFile;
}

function validatePayloadNotes(p: Payload) {
  if (!Array.isArray(p.notes) || p.notes.length === 0) throw new Error('publish-payload.json: notes required');
  for (const n of p.notes) {
    if (!n.title || n.title.length > MAX_NOTE_TITLE) {
      throw new Error(`Note title must be 1–${MAX_NOTE_TITLE} chars: "${n.title}" (${n.title?.length ?? 0})`);
    }
    if (n.noteType !== 'default' && n.noteType !== 'scripture') {
      throw new Error(`Invalid noteType for ${n.contentFile}: ${n.noteType}`);
    }
    const fp = resolve(NOTES_DIR, n.contentFile);
    if (!existsSync(fp)) throw new Error(`Missing HTML: ${n.contentFile}`);
    const html = readFileSync(fp, 'utf-8').trim();
    if (!html) throw new Error(`Empty HTML: ${n.contentFile}`);
    if (html.length > 50_000) throw new Error(`Content too long: ${n.contentFile}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipScripture = args.includes('--skip-scripture');

  const payload = loadPayload();
  validatePayloadNotes(payload);

  const mapRaw = loadMap();
  const threadId =
    process.env.EASTER_SYNC_THREAD_ID?.trim() || mapRaw.threadId || 'thread_1775233361457';
  const noteMap = mapRaw.notes;
  if (!noteMap || typeof noteMap !== 'object') throw new Error('PUBLISHED_NOTE_MAP.json: notes object required');

  for (const n of payload.notes) {
    const noteId = noteMap[n.contentFile];
    if (!noteId) throw new Error(`No note id in map for ${n.contentFile}`);
  }

  if (dryRun) {
    console.log('dry-run: would sync', payload.notes.length, 'notes to thread', threadId);
    for (const n of payload.notes) {
      const fp = resolve(NOTES_DIR, n.contentFile);
      const html = readFileSync(fp, 'utf-8');
      console.log(' ', noteMap[n.contentFile], n.title, `(${n.noteType}, ${html.length} chars)`);
    }
    if (skipScripture) console.log('dry-run: --skip-scripture would skip scripture processing');
    else console.log('dry-run: would run processScriptureReferences per note');
    return;
  }

  const systemUserId = getHarvousSystemUserId();

  for (const n of payload.notes) {
    const noteId = noteMap[n.contentFile]!;
    const content = readFileSync(resolve(NOTES_DIR, n.contentFile), 'utf-8').trim();

    const note = first(
      await db.select().from(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, systemUserId))).limit(1),
    );
    if (!note) {
      throw new Error(`Note ${noteId} not found or not owned by HARVOUS_SYSTEM_USER_ID`);
    }

    const junction = first(
      await db
        .select({ id: NoteThreads.id })
        .from(NoteThreads)
        .where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, threadId)))
        .limit(1),
    );
    const primaryThreadOk = note.threadId === threadId;
    if (!junction && !primaryThreadOk) {
      throw new Error(`Note ${noteId} is not linked to thread ${threadId} (no NoteThreads row, Notes.threadId mismatch)`);
    }

    await db
      .update(Notes)
      .set({
        title: n.title,
        content,
        noteType: n.noteType || 'default',
        updatedAt: nowISO(),
      })
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, systemUserId)));

    console.log('Updated note:', noteId, n.title);

    if (!skipScripture) {
      const { updatedContent } = await processScriptureReferences(noteId, systemUserId, threadId, undefined, 'NET');
      console.log('  scripture processing done; content length:', updatedContent.length);
    }
  }

  console.log('easter:sync-notes complete. Hard-refresh the thread page if you still see cached data.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
