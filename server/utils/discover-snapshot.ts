/**
 * Turning something you own into a Discover listing's payload.
 *
 * The server builds these itself from a row it has verified the caller owns —
 * a client-supplied payload is never trusted, because what gets approved has to
 * be what was submitted.
 *
 * Everything here **snapshots**. A listing carries the artifact, not a pointer
 * to it, so that approval is of bytes and the author can later edit or delete
 * the original without changing or breaking what other people took. The one
 * thing carried by reference is `sourceId` per note, and only so
 * `buildIndependentCopyAttribution` can write real lineage at install time.
 *
 * See server/db/schema.ts on `DiscoverListings` for why snapshot-not-pointer.
 */

import {
  db,
  Notes,
  Threads,
  NoteThreads,
  NoteTemplates,
  LibraryItems,
  ScriptureMetadata,
  ResourceMetadata,
  NoteScriptureReferences,
  Spaces,
  eq,
  and,
  asc,
  isNull,
  desc,
  sql,
  inArray,
  first,
} from '../db';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import { resolveNoteTemplateIconColor } from '@/utils/note-template-icon';
import { findPersonalLibrary } from './ensure-personal-library';

/**
 * How many notes one pack may carry.
 *
 * Enforced at **submit**, not install: an approved listing must never be able to
 * become unbounded later, and the reviewer should not be handed a thing they
 * cannot reasonably read before saying yes.
 */
export const MAX_PACK_NOTES = 100;

/**
 * Ceiling on one listing's stored payload.
 *
 * A pack of a hundred long notes is a multi-megabyte row that every review-queue
 * read would carry. Refusing at submit gives the person a sentence they can act
 * on; discovering it later gives everyone a slow queue.
 */
export const MAX_PAYLOAD_BYTES = 1_000_000;

export const EXCERPT_MAX_LENGTH = 220;
const PREVIEW_HEADINGS_MAX = 8;
const PREVIEW_TITLES_MAX = 12;

/** Scripture/resource sidecars, snapshotted so an install can rebuild them. */
export interface SnapshotNoteMeta {
  scripture?: {
    reference: string;
    book: string;
    chapter: number;
    verse: number;
    verseEnd: number | null;
    /** Cross-chapter ranges ("Exodus 6:28-7:7"). Dropping it would silently
        narrow the range on every copy. */
    chapterEnd: number | null;
    translation: string;
    originalText: string;
  } | null;
  resource?: {
    sourceUrl: string;
    sourceDomain: string | null;
    sourceName: string | null;
    sourceTitle: string | null;
    sourceDescription: string | null;
    sourceImage: string | null;
  } | null;
}

export interface SnapshotNote extends SnapshotNoteMeta {
  /** The original note id — provenance only, used for copiedFrom* at install. */
  sourceId: string;
  sourceVersionId: string | null;
  sourceAuthorId: string;
  title: string | null;
  content: string;
  noteType: string;
}

export interface TemplatePayload {
  name: string;
  title: string | null;
  content: string;
  noteType: string | null;
  iconColor: string | null;
}

export interface NotePayload extends SnapshotNote {}

export interface ResourcePayload {
  title: string;
  description: string | null;
  sourceUrl: string;
  sourceDomain: string | null;
  sourceSiteName: string | null;
  sourceImage: string | null;
}

export interface PackPayload {
  thread: { title: string; subtitle: string | null; color: string };
  notes: SnapshotNote[];
  /** Rebuilt at install by mapping source ids to the new ones. */
  references: Array<{ from: string; to: string }>;
}

export interface Snapshot {
  title: string;
  description: string | null;
  payload: string;
  preview: string;
  sourceVersionId: string | null;
}

export type SnapshotFailure = { ok: false; status: 400 | 404 | 409 | 413; code: string; error: string };
export type SnapshotResult = { ok: true; snapshot: Snapshot } | SnapshotFailure;

export function headingsOf(content: string): string[] {
  return [...content.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => stripHtmlForPreview(match[1], 80).trim())
    .filter(Boolean)
    .slice(0, PREVIEW_HEADINGS_MAX);
}

/**
 * Plain-text excerpt with block boundaries preserved.
 *
 * `stripHtmlForPreview` alone runs adjacent blocks together — `<h2>First</h2><p>one</p>`
 * came out as "Firstone" (see docs/STRIP_HTML_SPACING_ISSUE.md). The shared util
 * is used in a dozen places and is not this feature's to change, so the spacing
 * is inserted here, before it strips.
 */
export function excerptOf(html: string): string {
  const spaced = html.replace(/<\/(h[1-6]|p|div|li|blockquote|tr)>/gi, ' ');
  return stripHtmlForPreview(spaced, EXCERPT_MAX_LENGTH).replace(/\s+/g, ' ').trim();
}

/**
 * How much of a body a listing carries.
 *
 * The fade is what makes a cap free: a bounded body is invisible under a
 * gradient, so cutting here costs nothing on screen while keeping rows small,
 * the export small, and the static build fast. Cut on a tag boundary rather
 * than mid-attribute, then let the sanitizer close whatever is left open.
 */
export const BODY_HTML_MAX_LENGTH = 4000;

/**
 * The body a public page renders, capped. **Stored as authored, not sanitized
 * here — the renderer sanitizes.**
 *
 * This used to call `safeRenderHtml`, which is DOMPurify via
 * `isomorphic-dompurify` → jsdom. That works in a browser and in a test, and it
 * took the production API down the first time it shipped: `build:fly` bundles
 * the server into a single `api.cjs` and the image copies nothing else, so
 * jsdom's `readFileSync` of its own `default-stylesheet.css` had no file to
 * find and the process died at startup, before serving a request. There is no
 * DOM on this side and nothing here should reach for one.
 *
 * So the boundary moved to the only thing that renders this as HTML:
 * harvous.com sanitizes with `sanitize-html` (htmlparser2, no DOM) at build
 * time, immediately before `set:html`. The app's own public listing page never
 * renders it — it is the install action and nothing else — and the export is
 * consumed by that one build. Anything new that renders `bodyHtml` sanitizes
 * it first; `discover-bundle.test.ts` guards the half of that which is
 * mechanical.
 */
export function bodyHtmlOf(html: string): string {
  if (!html) return '';
  return html.length > BODY_HTML_MAX_LENGTH ? html.slice(0, BODY_HTML_MAX_LENGTH) : html;
}

function tooBig(payload: string): boolean {
  return Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES;
}

const TOO_BIG: SnapshotFailure = {
  ok: false,
  status: 413,
  code: 'PAYLOAD_TOO_LARGE',
  error: 'That is too big to share as one piece. Try sharing a smaller part of it.',
};

function metaFor(
  noteId: string,
  noteType: string,
  scripture: Map<string, typeof ScriptureMetadata.$inferSelect>,
  resource: Map<string, typeof ResourceMetadata.$inferSelect>,
): SnapshotNoteMeta {
  const s = noteType === 'scripture' ? scripture.get(noteId) : undefined;
  const r = noteType === 'resource' ? resource.get(noteId) : undefined;
  return {
    scripture: s
      ? {
          reference: s.reference,
          book: s.book,
          chapter: s.chapter,
          verse: s.verse,
          verseEnd: s.verseEnd ?? null,
          chapterEnd: s.chapterEnd ?? null,
          translation: s.translation,
          originalText: s.originalText,
        }
      : null,
    resource: r
      ? {
          sourceUrl: r.sourceUrl,
          sourceDomain: r.sourceDomain ?? null,
          sourceName: r.sourceName ?? null,
          sourceTitle: r.sourceTitle ?? null,
          sourceDescription: r.sourceDescription ?? null,
          sourceImage: r.sourceImage ?? null,
        }
      : null,
  };
}

/**
 * A template you saved.
 *
 * Yours, and not the church's: an org template is provisioned to a role and
 * belongs to the church that provisioned it, so the author of the row is not
 * the one who gets to give it away.
 */
export async function snapshotTemplate(templateId: string, userId: string): Promise<SnapshotResult> {
  const template = first(
    await db
      .select()
      .from(NoteTemplates)
      .where(
        and(
          eq(NoteTemplates.id, templateId),
          eq(NoteTemplates.userId, userId),
          isNull(NoteTemplates.orgId),
        ),
      )
      .limit(1),
  );
  if (!template) {
    return { ok: false, status: 404, code: 'TEMPLATE_NOT_FOUND', error: 'Template not found' };
  }
  const payload: TemplatePayload = {
    name: template.name,
    title: template.title,
    content: template.content,
    noteType: template.noteType,
    iconColor: template.iconColor,
  };
  const encoded = JSON.stringify(payload);
  if (tooBig(encoded)) return TOO_BIG;
  return {
    ok: true,
    snapshot: {
      title: template.name,
      description: template.description ?? null,
      payload: encoded,
      preview: JSON.stringify({
        titleTemplate: template.title,
        /* The colour its author picked, **resolved here rather than passed
           through raw**. `NoteTemplates.iconColor` is null for every built-in —
           their colour lives in `getBuiltInTemplates()` and only
           `resolveNoteTemplateIconColor` knows to look there — so publishing the
           column meant publishing null for the six templates that most
           definitely have a colour.
    
           Resolving on write also settles *which* id the fallback hash runs on.
           The picker hashes the template id; a reader with only the listing has
           nothing but the slug, so the same template came out one colour in the
           templates sheet and another in Discover. One resolved value, written
           once, and every surface agrees by construction. */
        iconColor: resolveNoteTemplateIconColor(template.id, template.iconColor),
        /* NOT a built-in check. `NoteTemplates` rows are personal saves; the
           built-ins live in code and never get a row, so `template.id` is always
           a `ntpl_…` and matching it against `getBuiltInTemplates()` is dead by
           construction. Marking a listing as Harvous's own is a *reviewer's*
           call — it is a judgement about provenance that only the person
           approving it can make — so `preview.official` stays unset here and is
           the review endpoint's to write if that ever ships. */
        headings: headingsOf(template.content),
        excerpt: excerptOf(template.content),
        /* A template's body is its scaffold — headings and the instructions
           under them. The page draws it as an empty form rather than fading it,
           because there is nothing being held back. */
        bodyHtml: bodyHtmlOf(template.content),
      }),
      sourceVersionId: null,
    },
  };
}

/**
 * One finished note.
 *
 * Requires the note to be public already. Not a technical need — the listing
 * snapshots, so it would work either way — but a consent one: offering
 * something to a public catalog before it is public at all inverts the
 * escalation, and `POST /api/notes/:id/share` is where the shared-space
 * acknowledgement gate lives.
 */
export async function snapshotNote(noteId: string, userId: string): Promise<SnapshotResult> {
  const note = first(
    await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        userId: Notes.userId,
        isPublic: Notes.isPublic,
        contentEncrypted: Notes.contentEncrypted,
        currentVersionId: Notes.currentVersionId,
      })
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .limit(1),
  );
  if (!note) return { ok: false, status: 404, code: 'NOTE_NOT_FOUND', error: 'Note not found' };
  if (note.contentEncrypted) {
    return {
      ok: false,
      status: 409,
      code: 'ENCRYPTED_NOTE_CANNOT_SHARE',
      error: 'A locked note cannot be shared.',
    };
  }
  if (!note.isPublic) {
    return {
      ok: false,
      status: 409,
      code: 'NOTE_NOT_PUBLIC',
      error: 'Turn on sharing for this note first.',
    };
  }

  const [scriptureRows, resourceRows] = await Promise.all([
    note.noteType === 'scripture'
      ? db.select().from(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, note.id))
      : Promise.resolve([] as (typeof ScriptureMetadata.$inferSelect)[]),
    note.noteType === 'resource'
      ? db.select().from(ResourceMetadata).where(eq(ResourceMetadata.noteId, note.id))
      : Promise.resolve([] as (typeof ResourceMetadata.$inferSelect)[]),
  ]);

  const payload: NotePayload = {
    sourceId: note.id,
    sourceVersionId: note.currentVersionId ?? null,
    sourceAuthorId: note.userId,
    title: note.title ?? null,
    content: note.content,
    noteType: note.noteType || 'default',
    ...metaFor(
      note.id,
      note.noteType || 'default',
      new Map(scriptureRows.map((r) => [r.noteId, r])),
      new Map(resourceRows.map((r) => [r.noteId, r])),
    ),
  };
  const encoded = JSON.stringify(payload);
  if (tooBig(encoded)) return TOO_BIG;

  return {
    ok: true,
    snapshot: {
      title: note.title?.trim() || 'Untitled note',
      description: null,
      payload: encoded,
      preview: JSON.stringify({
        headings: headingsOf(note.content),
        excerpt: excerptOf(note.content),
        /* So a scripture note is not drawn as a plain one. */
        noteType: note.noteType || 'default',
        bodyHtml: bodyHtmlOf(note.content),
      }),
      sourceVersionId: note.currentVersionId ?? null,
    },
  };
}

/**
 * A whole thread as one installable pack.
 *
 * Mirrors what `/api/shared/add-to-harvous` collects — the thread's own notes
 * plus the scripture notes they reference — so a pack arrives as complete as a
 * shared thread does. The two refusals are the same ones the share path makes:
 * a thread living in a shared space is not the owner's alone to give away, and
 * encrypted notes never leave.
 */
export async function snapshotPack(threadId: string, userId: string): Promise<SnapshotResult> {
  const thread = first(
    await db
      .select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        color: Threads.color,
        userId: Threads.userId,
        spaceId: Threads.spaceId,
        isPublic: Threads.isPublic,
      })
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .limit(1),
  );
  if (!thread) return { ok: false, status: 404, code: 'THREAD_NOT_FOUND', error: 'Thread not found' };
  /* Deliberately **not** gated on `thread.isPublic`, unlike snapshotNote.
     The note gate is a consent-ordering step that costs nothing because a note's
     public state is something the person can already see and set. A thread's is
     not: `POST /api/threads/:threadId/share` exists on the server, but no SPA
     surface calls it, so requiring it here would be a door with no handle —
     packs would be unsubmittable by anyone, including over the API.

     The gates that actually protect a pack are the ones below and above:
     ownership, not-in-a-shared-space, encrypted notes excluded, the size caps,
     and the review queue. If thread sharing ever ships a UI, add the same
     `isPublic` check here and the asymmetry goes away. */
  if (thread.spaceId) {
    const space = first(
      await db
        .select({ type: Spaces.type, deletedAt: Spaces.deletedAt })
        .from(Spaces)
        .where(eq(Spaces.id, thread.spaceId))
        .limit(1),
    );
    if (!space || space.deletedAt || space.type !== 'personal') {
      return {
        ok: false,
        status: 409,
        code: 'THREAD_IN_SHARED_SPACE',
        error: 'A thread in a shared space is the room’s, not yours alone to give away.',
      };
    }
  }

  const junctionNotes = await db
    .select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      noteType: Notes.noteType,
      userId: Notes.userId,
      currentVersionId: Notes.currentVersionId,
    })
    .from(Notes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(and(eq(NoteThreads.threadId, thread.id), eq(Notes.contentEncrypted, false)))
    .orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id),
    );

  const junctionIds = junctionNotes.map((n) => n.id).filter(Boolean);
  let referencedScripture: typeof junctionNotes = [];
  if (junctionIds.length > 0) {
    const refs = await db
      .select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
      .where(
        and(
          inArray(NoteScriptureReferences.noteId, junctionIds),
          eq(Notes.userId, thread.userId),
          eq(Notes.noteType, 'scripture'),
        ),
      );
    const already = new Set(junctionNotes.filter((n) => n.noteType === 'scripture').map((n) => n.id));
    const extra = [...new Set(refs.map((r) => r.scriptureNoteId))].filter((id) => !already.has(id));
    if (extra.length > 0) {
      referencedScripture = await db
        .select({
          id: Notes.id,
          title: Notes.title,
          content: Notes.content,
          noteType: Notes.noteType,
          userId: Notes.userId,
          currentVersionId: Notes.currentVersionId,
        })
        .from(Notes)
        .where(
          and(
            inArray(Notes.id, extra),
            eq(Notes.userId, thread.userId),
            eq(Notes.noteType, 'scripture'),
            eq(Notes.contentEncrypted, false),
          ),
        );
    }
  }

  const byId = new Map<string, (typeof junctionNotes)[0]>();
  for (const n of [...junctionNotes, ...referencedScripture]) {
    if (n.id && !byId.has(n.id)) byId.set(n.id, n);
  }
  const sourceNotes = [...byId.values()];

  if (sourceNotes.length === 0) {
    return {
      ok: false,
      status: 400,
      code: 'EMPTY_PACK',
      error: 'There is nothing in this thread to share yet.',
    };
  }
  if (sourceNotes.length > MAX_PACK_NOTES) {
    return {
      ok: false,
      status: 413,
      code: 'PACK_TOO_LARGE',
      error: `A pack can hold up to ${MAX_PACK_NOTES} notes. This one has ${sourceNotes.length}.`,
    };
  }

  const ids = sourceNotes.map((n) => n.id);
  const [scriptureRows, resourceRows, referenceRows] = await Promise.all([
    db.select().from(ScriptureMetadata).where(inArray(ScriptureMetadata.noteId, ids)),
    db.select().from(ResourceMetadata).where(inArray(ResourceMetadata.noteId, ids)),
    db
      .select({
        noteId: NoteScriptureReferences.noteId,
        scriptureNoteId: NoteScriptureReferences.scriptureNoteId,
      })
      .from(NoteScriptureReferences)
      .where(inArray(NoteScriptureReferences.noteId, ids)),
  ]);
  const scriptureByNote = new Map(scriptureRows.map((r) => [r.noteId, r]));
  const resourceByNote = new Map(resourceRows.map((r) => [r.noteId, r]));
  const present = new Set(ids);

  const payload: PackPayload = {
    thread: {
      title: thread.title,
      subtitle: thread.subtitle ?? null,
      color: thread.color || 'paper',
    },
    notes: sourceNotes.map((n) => ({
      sourceId: n.id,
      sourceVersionId: n.currentVersionId ?? null,
      sourceAuthorId: n.userId,
      title: n.title ?? null,
      content: n.content ?? '',
      noteType: n.noteType || 'default',
      ...metaFor(n.id, n.noteType || 'default', scriptureByNote, resourceByNote),
    })),
    // Only edges whose both ends travel with the pack; a reference to a note
    // left behind would install as a dangling row.
    references: referenceRows
      .filter((r) => present.has(r.noteId) && present.has(r.scriptureNoteId))
      .map((r) => ({ from: r.noteId, to: r.scriptureNoteId })),
  };
  const encoded = JSON.stringify(payload);
  if (tooBig(encoded)) return TOO_BIG;

  const firstBody = sourceNotes.find((n) => n.noteType !== 'scripture')?.content ?? sourceNotes[0].content ?? '';
  return {
    ok: true,
    snapshot: {
      title: thread.title,
      description: thread.subtitle ?? null,
      payload: encoded,
      preview: JSON.stringify({
        noteCount: sourceNotes.length,
        titles: sourceNotes
          .map((n) => n.title?.trim())
          .filter((t): t is string => Boolean(t))
          .slice(0, PREVIEW_TITLES_MAX),
        excerpt: excerptOf(firstBody),
        /* No colour. `Threads.color` still exists and shared-space covers still
           read it, but a personal Thread has not been drawn in its own hue since
           `proto-collection-card` — it is a neutral icon tile, a title and a note
           count. Publishing a colour here would have the catalog draw Threads in a
           language the app retired, and the two would disagree on the same Thread. */
        /* Only the first note's body: the page renders it in full and lists the
           rest by title, so it stays a page whether the Thread holds 4 or 100. */
        bodyHtml: bodyHtmlOf(firstBody),
      }),
      sourceVersionId: null,
    },
  };
}

/**
 * A link from your own library.
 *
 * **Links only.** A file-kind item means copying a private Supabase object
 * between owners — a copy path, a size cap, and an abuse story that do not
 * exist. `LibraryItemSuggestions`' docblock already ruled on that exact
 * question for congregant uploads, and it holds with more force for a catalog
 * open to everyone.
 *
 * The URL is snapshotted but **re-validated at install**, because the snapshot
 * may be months old by the time someone takes it.
 */
export async function snapshotResource(itemId: string, userId: string): Promise<SnapshotResult> {
  const library = await findPersonalLibrary(userId);
  if (!library) {
    return { ok: false, status: 404, code: 'LIBRARY_ITEM_NOT_FOUND', error: 'Item not found' };
  }
  const item = first(
    await db
      .select()
      .from(LibraryItems)
      .where(
        and(
          eq(LibraryItems.id, itemId),
          eq(LibraryItems.libraryId, library.id),
          isNull(LibraryItems.archivedAt),
        ),
      )
      .limit(1),
  );
  if (!item) {
    return { ok: false, status: 404, code: 'LIBRARY_ITEM_NOT_FOUND', error: 'Item not found' };
  }
  if (item.kind !== 'link' || !item.sourceUrl) {
    return {
      ok: false,
      status: 409,
      code: 'RESOURCE_NOT_A_LINK',
      error: 'Only links can be shared for now.',
    };
  }

  const payload: ResourcePayload = {
    title: item.title,
    description: item.description ?? null,
    sourceUrl: item.sourceUrl,
    sourceDomain: item.sourceDomain ?? null,
    sourceSiteName: item.sourceSiteName ?? null,
    sourceImage: item.sourceImage ?? null,
  };
  const encoded = JSON.stringify(payload);
  if (tooBig(encoded)) return TOO_BIG;

  return {
    ok: true,
    snapshot: {
      title: item.title,
      description: item.description ?? null,
      payload: encoded,
      preview: JSON.stringify({
        sourceDomain: item.sourceDomain ?? null,
        sourceSiteName: item.sourceSiteName ?? null,
        /* Without it there is no link card at all — the image is most of what a
           link looks like in this app. */
        sourceImage: item.sourceImage ?? null,
        excerpt: (item.description ?? '').slice(0, EXCERPT_MAX_LENGTH),
      }),
      sourceVersionId: null,
    },
  };
}
