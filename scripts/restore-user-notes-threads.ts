/**
 * Restore notes and threads for a user from recovered JSON or CSV files.
 *
 * Usage (from repo root, with DB credentials in .env):
 *
 *   # Single JSON file with { threads: [...], notes: [...] }
 *   USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK npx tsx scripts/restore-user-notes-threads.ts --file ./recovered-data.json
 *
 *   # Separate thread and note files (JSON or CSV)
 *   USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK npx tsx scripts/restore-user-notes-threads.ts --threads ./threads.json --notes ./notes.json
 *
 *   # CSV (column names should match schema: id, title, content, threadId, etc.)
 *   USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK npx tsx scripts/restore-user-notes-threads.ts --threads ./threads.csv --notes ./notes.csv
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_*).
 * After restore, run scripts/reset-user-simple-note-id.ts to reconcile highestSimpleNoteId (clean restore).
 *
 * Expected columns (JSON keys or CSV headers):
 *   Threads: id, title, subtitle, spaceId, createdAt, updatedAt, lastVisited, isPublic, isPinned, color, order, shareToken, shareTokenCreatedAt
 *   Notes:   id, title, content, threadId, spaceId, simpleNoteId, noteType, addedBy, createdAt, updatedAt, lastVisited, isPublic, isFeatured, order, shareToken, shareTokenCreatedAt, contentEncrypted
 *   (userId is always set to USER_ID; other missing fields get defaults.)
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { db, Threads, Notes, NoteThreads, UserMetadata, eq } from '../server/db';
import { nowISO } from '../server/db/dates';

const USER_ID = process.env.USER_ID!.trim();

// ─── CSV parse (simple: header row, then rows; handles quoted fields) ────────
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

// ─── Load JSON or CSV from path ───────────────────────────────────────────────
function loadTable(path: string): unknown[] {
  const abs = resolve(path);
  const raw = readFileSync(abs, 'utf-8');
  const ext = abs.toLowerCase().slice(-4);
  if (ext === '.csv') {
    return parseCSV(raw) as unknown[];
  }
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.threads) && Array.isArray(data.notes)) {
    return []; // caller will use data.threads / data.notes
  }
  return [data];
}

/** When loading a single-table Drizzle export { "Threads": [...] } or { "Notes": [...] }, unwrap to the array. */
function normalizeLoadedTable(loaded: unknown[], kind: 'threads' | 'notes'): Record<string, unknown>[] {
  if (Array.isArray(loaded) && loaded.length > 0) {
    const first = loaded[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      const o = first as Record<string, unknown>;
      if (kind === 'threads' && Array.isArray(o.Threads)) return o.Threads as Record<string, unknown>[];
      if (kind === 'threads' && Array.isArray(o.threads)) return o.threads as Record<string, unknown>[];
      if (kind === 'notes' && Array.isArray(o.Notes)) return o.Notes as Record<string, unknown>[];
      if (kind === 'notes' && Array.isArray(o.notes)) return o.notes as Record<string, unknown>[];
    }
    return loaded as Record<string, unknown>[];
  }
  return loaded as Record<string, unknown>[];
}

// ─── Normalize row: ensure required fields, coerce types ──────────────────────
function toThreadRow(row: Record<string, unknown>, userId: string) {
  const id = String(row.id ?? '').trim();
  if (!id) return null;
  const now = nowISO();
  return {
    id,
    title: String(row.title ?? 'Untitled').trim() || 'Untitled',
    subtitle: row.subtitle != null ? String(row.subtitle) : null,
    spaceId: row.spaceId != null ? String(row.spaceId) : null,
    createdAt: row.createdAt != null ? String(row.createdAt) : now,
    updatedAt: row.updatedAt != null ? String(row.updatedAt) : null,
    lastVisited: row.lastVisited != null ? String(row.lastVisited) : null,
    userId,
    isPublic: Boolean(row.isPublic ?? false),
    isPinned: Boolean(row.isPinned ?? false),
    color: row.color != null ? String(row.color) : null,
    order: Number(row.order) || 0,
    shareToken: row.shareToken != null ? String(row.shareToken) : null,
    shareTokenCreatedAt: row.shareTokenCreatedAt != null ? String(row.shareTokenCreatedAt) : null,
  };
}

function toNoteRow(row: Record<string, unknown>, userId: string) {
  const id = String(row.id ?? '').trim();
  const threadId = String(row.threadId ?? '').trim();
  if (!id || !threadId) return null;
  const now = nowISO();
  const simpleNoteId = row.simpleNoteId != null ? Number(row.simpleNoteId) : null;
  return {
    id,
    title: row.title != null ? String(row.title) : null,
    content: String(row.content ?? ''),
    threadId,
    spaceId: row.spaceId != null ? String(row.spaceId) : null,
    simpleNoteId: Number.isInteger(simpleNoteId) ? simpleNoteId : null,
    noteType: String(row.noteType ?? 'default'),
    addedBy: String(row.addedBy ?? 'user'),
    createdAt: row.createdAt != null ? String(row.createdAt) : now,
    updatedAt: row.updatedAt != null ? String(row.updatedAt) : null,
    lastVisited: row.lastVisited != null ? String(row.lastVisited) : null,
    userId,
    isPublic: Boolean(row.isPublic ?? false),
    isFeatured: Boolean(row.isFeatured ?? false),
    order: Number(row.order) || 0,
    shareToken: row.shareToken != null ? String(row.shareToken) : null,
    shareTokenCreatedAt: row.shareTokenCreatedAt != null ? String(row.shareTokenCreatedAt) : null,
    contentEncrypted: Boolean(row.contentEncrypted ?? false),
  };
}

function toNoteThreadRow(noteId: string, threadId: string) {
  const now = nowISO();
  return {
    id: `nt_${noteId}_${threadId}`,
    noteId,
    threadId,
    createdAt: now,
  };
}

async function main() {
  if (!USER_ID) {
    console.error('Set USER_ID (e.g. user_35FUJeLEI2L0gRjCJqIIbNWraRK).');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  let threadsPath: string | null = null;
  let notesPath: string | null = null;
  let singlePath: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--threads' && args[i + 1]) {
      threadsPath = args[++i];
    } else if (args[i] === '--notes' && args[i + 1]) {
      notesPath = args[++i];
    } else if (args[i] === '--file' && args[i + 1]) {
      singlePath = args[++i];
    }
  }

  let threads: Record<string, unknown>[] = [];
  let notes: Record<string, unknown>[] = [];

  if (singlePath) {
    const abs = resolve(singlePath);
    const raw = readFileSync(abs, 'utf-8');
    const data = JSON.parse(raw);
    // Support { threads, notes }, { Threads, Notes } (Drizzle), or root-level array of notes
    if (Array.isArray(data.threads)) threads = data.threads;
    if (Array.isArray(data.notes)) notes = data.notes;
    if (Array.isArray(data.Threads)) threads = data.Threads;
    if (Array.isArray(data.Notes)) notes = data.Notes;
    if (Array.isArray(data) && threads.length === 0 && notes.length === 0) {
      notes = data as Record<string, unknown>[];
    }
    if (threads.length === 0 && notes.length === 0) {
      console.error('Single file must contain threads/notes (e.g. { threads: [...], notes: [...] } or { Threads: [...], Notes: [...] }) or a root-level array of note objects.');
      process.exit(1);
    }
  } else {
    if (threadsPath) {
      const loaded = loadTable(threadsPath);
      threads = normalizeLoadedTable(loaded as unknown[], 'threads');
    }
    if (notesPath) {
      const loaded = loadTable(notesPath);
      notes = normalizeLoadedTable(loaded as unknown[], 'notes');
    }
  }

  if (threads.length === 0 && notes.length === 0) {
    console.error('No threads or notes to restore. Use --file <json> or --threads <path> and/or --notes <path>.');
    process.exit(1);
  }

  const threadRows = threads
    .map((r) => toThreadRow(r as Record<string, unknown>, USER_ID))
    .filter(Boolean) as NonNullable<ReturnType<typeof toThreadRow>>[];
  const noteRows = notes
    .map((r) => toNoteRow(r as Record<string, unknown>, USER_ID))
    .filter(Boolean) as NonNullable<ReturnType<typeof toNoteRow>>[];

  const noteThreadPairs = noteRows.map((n) => ({ noteId: n.id, threadId: n.threadId }));

  console.log('Threads to restore:', threadRows.length);
  console.log('Notes to restore:', noteRows.length);

  for (const row of threadRows) {
    try {
      await db.insert(Threads).values(row).onConflictDoNothing({ target: Threads.id });
    } catch (e) {
      console.warn('Thread insert skip (may already exist):', row.id, (e as Error).message);
    }
  }

  for (const row of noteRows) {
    try {
      await db.insert(Notes).values(row).onConflictDoNothing({ target: Notes.id });
    } catch (e) {
      console.warn('Note insert skip (may already exist):', row.id, (e as Error).message);
    }
  }

  for (const { noteId, threadId } of noteThreadPairs) {
    try {
      await db
        .insert(NoteThreads)
        .values(toNoteThreadRow(noteId, threadId))
        .onConflictDoNothing({ target: NoteThreads.id });
    } catch (e) {
      console.warn('NoteThread skip:', noteId, threadId, (e as Error).message);
    }
  }

  // Ensure UserMetadata exists (reset-user-simple-note-id.ts expects it)
  const meta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, USER_ID)).get();
  if (!meta) {
    const now = nowISO();
    await db.insert(UserMetadata).values({
      id: `user_metadata_${USER_ID}`,
      userId: USER_ID,
      highestSimpleNoteId: 0,
      userColor: 'blue',
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log('Restore done. Reconcile highestSimpleNoteId with:');
  console.log(`  USER_ID=${USER_ID} npx tsx scripts/reset-user-simple-note-id.ts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
