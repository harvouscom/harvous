/**
 * The Connector's one write: `start_note`. MCP-free, like read-service.ts.
 *
 * Starts ONE new, empty note in My Home's unorganized thread, with the app's summary in a
 * side-table card (NoteChatOrigins) rather than in the note — the body is the person's.
 * It can never name an existing note, so it can never change or delete one.
 *
 * Guardrails (docs/future/CONNECTOR_BOUNDARIES.md), each checked before anything is written:
 * Plus (beforeCall), the person's "Let AI apps start notes" switch, NOTES_STARTED_PER_DAY, and
 * the app-wide note-create rate limit. tools-contract.test.ts pins what this file may write.
 */

import { db, Notes, UserMetadata, Threads, NoteChatOrigins, eq, and, first } from '../db';
import { generateNoteId } from '@/utils/ids';
import { tryConsumeNoteCreates } from '@/utils/rate-limit';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { getEffectiveHighestSimpleNoteId } from '../utils/highest-simple-note-id';
import { createInitialNoteVersion } from '../utils/note-version-service';
import { broadcastCanonicalNoteInvalidation } from '../utils/broadcast-shared-space-note';
import { canonicalizeServiceReference } from '../utils/church-service-passage';
import { connectorAddedBy, connectorAppFromClientName } from '@/utils/connector-app-name';
import { noteUrl } from './config';
import { allowsStartNotes } from './preferences';
import { connectorClientName, consumeNoteStart } from './usage';
import { ConnectorRefusal } from './shapes';

/** The app's own title cap (TITLE_HARD_LIMIT in server/routes/notes.ts). */
const TITLE_MAX = 50;
export const MAX_PASSAGES = 10;

export interface StartNoteInput {
  title: string;
  summary: string;
  passages?: string[];
  question?: string | null;
}

export interface StartedNote {
  noteId: string;
  title: string;
  url: string;
  /** The app the note says it started in. */
  app: string;
  passages: string[];
  /** References that could not be read as Bible passages and were left out. */
  droppedPassages: string[];
}

/** Trim to the app's 50-character title at a word boundary, capitalized like the app does. */
export function noteTitleFrom(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  let title = clean;
  if (clean.length > TITLE_MAX) {
    const cut = clean.slice(0, TITLE_MAX);
    const space = cut.lastIndexOf(' ');
    title = (space > TITLE_MAX * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, '');
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Canonical, deduplicated references; anything unreadable is dropped and reported. */
export function canonicalPassages(raw: readonly string[] | undefined): { passages: string[]; dropped: string[] } {
  const passages: string[] = [];
  const dropped: string[] = [];
  for (const entry of raw ?? []) {
    const result = canonicalizeServiceReference(entry);
    if (result.ok && result.reference) {
      if (!passages.includes(result.reference)) passages.push(result.reference);
    } else if (entry.trim()) {
      dropped.push(entry.trim());
    }
  }
  return { passages: passages.slice(0, MAX_PASSAGES), dropped };
}

export async function startNote(userId: string, clientId: string, input: StartNoteInput): Promise<StartedNote> {
  if (!(await allowsStartNotes(userId))) {
    throw new ConnectorRefusal(
      'turned_off',
      'Starting notes from AI apps is off. The person can turn it on in Harvous: Settings › Connector › "Let AI apps start notes".',
    );
  }

  const reservation = tryConsumeNoteCreates(userId, undefined, 1);
  if (!reservation.allowed) throw new ConnectorRefusal('rate_limited', reservation.error);
  await consumeNoteStart(userId);

  const app = connectorAppFromClientName(await connectorClientName(userId, clientId));
  const title = noteTitleFrom(input.title);
  const summary = input.summary.trim();
  const question = input.question?.trim() || null;
  const { passages, dropped } = canonicalPassages(input.passages);

  const metadata = first(
    await db.select({ id: UserMetadata.id }).from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1),
  );
  if (!metadata) {
    throw new ConnectorRefusal('bad_request', 'Open Harvous once to finish setting up, then try again.');
  }

  await ensureUnorganizedThread(userId);
  const effectiveHighest = await getEffectiveHighestSimpleNoteId(userId);
  const noteId = generateNoteId();
  const now = new Date();

  await db.transaction(async (tx) => {
    const locked = first(
      await tx.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).for('update').limit(1),
    );
    if (!locked) throw new Error('User metadata disappeared during note creation');
    const simpleNoteId = Math.max(effectiveHighest, locked.highestSimpleNoteId ?? 0) + 1;

    await tx.insert(Notes).values({
      id: noteId,
      title,
      content: '',
      threadId: 'thread_unorganized',
      spaceId: null,
      simpleNoteId,
      noteType: 'default',
      addedBy: connectorAddedBy(app),
      userId,
      isPublic: false,
      contentEncrypted: false,
      createdAt: now,
      updatedAt: now,
      lastVisited: now,
    });
    await createInitialNoteVersion(tx, {
      noteId,
      noteAuthorId: userId,
      content: { title, content: '', contentEncrypted: false },
      createdAt: now,
      source: 'mcp',
    });
    await tx.insert(NoteChatOrigins).values({
      noteId,
      userId,
      appName: app.name,
      summary,
      passages: JSON.stringify(passages),
      question,
      createdAt: now,
    });
    await tx
      .update(UserMetadata)
      .set({ highestSimpleNoteId: simpleNoteId, updatedAt: now })
      .where(eq(UserMetadata.userId, userId));
  });

  // Same follow-through as POST /api/notes/create: the thread sorts as touched, and open
  // tabs hear about the new note.
  await db
    .update(Threads)
    .set({ updatedAt: now })
    .where(and(eq(Threads.id, 'thread_unorganized'), eq(Threads.userId, userId)))
    .catch(() => {});
  void broadcastCanonicalNoteInvalidation(userId, noteId, { type: 'note:created', id: noteId }).catch(() => {});

  return { noteId, title, url: noteUrl(noteId), app: app.name, passages, droppedPassages: dropped };
}
