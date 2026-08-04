import { db, first, Tags, NoteTags, Notes, eq, and } from '../db';
import { nowISO, toDate } from '../db/dates';
import { conceptOverlapsAny } from '@/utils/bible-study-concept-overlaps';

export type TagRow = {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  userId: string;
  isSystem: boolean;
  // `ts()` columns are mode: 'date', so a row read from the DB carries real Dates.
  // Strings stay in the union for callers rehydrating from JSON.
  createdAt: Date | string;
  updatedAt: Date | string | null;
};

export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

/** Parse Notes.dismissedAutoTags JSON column. */
export function parseDismissedAutoTags(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const key = normalizeTagName(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  } catch {
    return [];
  }
}

/** Serialize dismissed auto-tag names for Notes.dismissedAutoTags. */
export function serializeDismissedAutoTags(names: string[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = normalizeTagName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.length > 0 ? JSON.stringify(out) : null;
}

export function dismissedAutoTagsForNote(note: { dismissedAutoTags?: string | null }): string[] {
  return parseDismissedAutoTags(note.dismissedAutoTags);
}

/** Append a dismissed auto-tag name on the note (normalized, deduped). */
export async function addDismissedAutoTag(noteId: string, tagName: string): Promise<string[]> {
  const normalized = normalizeTagName(tagName);
  if (!normalized) return [];

  const noteRow = first(
    await db.select({ dismissedAutoTags: Notes.dismissedAutoTags }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
  );
  if (!noteRow) return [];

  const current = parseDismissedAutoTags(noteRow.dismissedAutoTags);
  if (current.includes(normalized)) return current;

  const next = [...current, normalized];
  await db.update(Notes).set({ dismissedAutoTags: serializeDismissedAutoTags(next) }).where(eq(Notes.id, noteId));
  return next;
}

/** Remove a name from dismissed auto-tags (user manually re-added the tag). */
export async function removeDismissedAutoTag(noteId: string, tagName: string): Promise<string[]> {
  const normalized = normalizeTagName(tagName);
  if (!normalized) return [];

  const noteRow = first(
    await db.select({ dismissedAutoTags: Notes.dismissedAutoTags }).from(Notes).where(eq(Notes.id, noteId)).limit(1),
  );
  if (!noteRow) return [];

  const current = parseDismissedAutoTags(noteRow.dismissedAutoTags);
  const next = current.filter((n) => n !== normalized);
  await db.update(Notes).set({ dismissedAutoTags: serializeDismissedAutoTags(next) }).where(eq(Notes.id, noteId));
  return next;
}

/** Clear all dismissed auto-tags (explicit regenerate auto suggestion). */
export async function clearDismissedAutoTags(noteId: string): Promise<void> {
  await db.update(Notes).set({ dismissedAutoTags: null }).where(eq(Notes.id, noteId));
}

/** Folder labels + dismissed tag names for auto-tag exclusion. */
export function autoTagExcludeNames(folderLabels: string[], dismissed: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of [...folderLabels, ...dismissed]) {
    const key = normalizeTagName(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label.trim());
  }
  return out;
}

export function isTagNameDismissed(tagName: string, dismissed: string[]): boolean {
  const normalized = normalizeTagName(tagName);
  if (!normalized) return false;
  return dismissed.some((d) => normalizeTagName(d) === normalized || conceptOverlapsAny(tagName, [d]));
}

export async function findTagByName(userId: string, name: string): Promise<TagRow | undefined> {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const allUserTags = await db.select().from(Tags).where(eq(Tags.userId, userId));
  return allUserTags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
}

export interface GetOrCreateTagOptions {
  color?: string | null;
  category?: string | null;
  isSystem?: boolean;
}

export interface GetOrCreateTagResult {
  tagId: string;
  created: boolean;
  tag: TagRow;
}

export async function getOrCreateTag(
  userId: string,
  name: string,
  opts?: GetOrCreateTagOptions,
): Promise<GetOrCreateTagResult> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tag name cannot be empty');

  const existing = await findTagByName(userId, trimmed);
  if (existing) {
    return { tagId: existing.id, created: false, tag: existing };
  }

  const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await db.insert(Tags).values({
    id: tagId,
    name: trimmed,
    color: opts?.color ?? null,
    category: opts?.category ?? null,
    userId,
    isSystem: opts?.isSystem ?? false,
    createdAt: nowISO(),
  });

  const tag = first(await db.select().from(Tags).where(eq(Tags.id, tagId)).limit(1))!;
  return { tagId, created: true, tag };
}

export type NoteTagResponseRow = {
  id: string;
  name: string;
  isAutoGenerated?: boolean | null;
  createdAt?: Date | string | null;
};

function pickPreferredTag<T extends NoteTagResponseRow>(a: T, b: T): T {
  const aAuto = a.isAutoGenerated === true;
  const bAuto = b.isAutoGenerated === true;
  if (aAuto !== bAuto) return aAuto ? b : a;

  // toDate, not Date.parse: these rows carry Date objects, and Date.parse(aDate)
  // stringifies via toString() — which has second precision, so two tags created in
  // the same second compared as equal and fell through to id ordering.
  const aCreated = toDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bCreated = toDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aCreated !== bCreated) return aCreated < bCreated ? a : b;

  return a.id < b.id ? a : b;
}

/** One entry per normalized tag name; prefers user-assigned over auto-generated. */
export function dedupeNoteTagsForResponse<T extends NoteTagResponseRow>(tags: T[]): T[] {
  const byName = new Map<string, T>();
  for (const tag of tags) {
    const key = normalizeTagName(tag.name);
    if (!key) continue;
    const prev = byName.get(key);
    byName.set(key, prev ? pickPreferredTag(prev, tag) : tag);
  }

  const seen = new Set<string>();
  const out: T[] = [];
  for (const tag of tags) {
    const key = normalizeTagName(tag.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const picked = byName.get(key);
    if (picked) out.push(picked);
  }
  return out;
}

export type NoteTagDetailRow = {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  isSystem: boolean;
  isAutoGenerated: boolean | null;
  confidence: number | null;
  createdAt: Date | string;
};

/** Tags on a note for API responses (join Tags owned by note author). */
export async function fetchNoteTagsForResponse(
  noteId: string,
  noteOwnerUserId: string,
): Promise<NoteTagDetailRow[]> {
  const noteTags = await db
    .select({
      id: Tags.id,
      name: Tags.name,
      color: Tags.color,
      category: Tags.category,
      isSystem: Tags.isSystem,
      isAutoGenerated: NoteTags.isAutoGenerated,
      confidence: NoteTags.confidence,
      createdAt: NoteTags.createdAt,
    })
    .from(NoteTags)
    .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
    .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, noteOwnerUserId)))
    .orderBy(Tags.name);
  return dedupeNoteTagsForResponse(noteTags);
}

export async function noteHasTagWithNormalizedName(
  noteId: string,
  tagName: string,
  noteOwnerUserId: string,
): Promise<boolean> {
  const normalized = normalizeTagName(tagName);
  if (!normalized) return false;

  const existing = await db
    .select({ name: Tags.name })
    .from(NoteTags)
    .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
    .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, noteOwnerUserId)));

  return existing.some((t) => normalizeTagName(t.name) === normalized);
}

export async function removeNoteTagsByName(
  noteId: string,
  tagName: string,
  noteOwnerUserId: string,
): Promise<{ removed: number; hadAutoGenerated: boolean }> {
  const normalized = normalizeTagName(tagName);
  if (!normalized) return { removed: 0, hadAutoGenerated: false };

  const links = await db
    .select({
      tagId: NoteTags.tagId,
      name: Tags.name,
      isAutoGenerated: NoteTags.isAutoGenerated,
    })
    .from(NoteTags)
    .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
    .where(and(eq(NoteTags.noteId, noteId), eq(Tags.userId, noteOwnerUserId)));

  let removed = 0;
  let hadAutoGenerated = false;
  for (const link of links) {
    if (normalizeTagName(link.name) !== normalized) continue;
    if (link.isAutoGenerated === true) hadAutoGenerated = true;
    await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, link.tagId)));
    removed++;
  }
  return { removed, hadAutoGenerated };
}

export async function removeNoteTagById(
  noteId: string,
  tagId: string,
): Promise<{ removed: boolean; hadAutoGenerated: boolean; tagName: string | null }> {
  const link = first(
    await db
      .select({
        tagId: NoteTags.tagId,
        name: Tags.name,
        isAutoGenerated: NoteTags.isAutoGenerated,
      })
      .from(NoteTags)
      .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
      .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)))
      .limit(1),
  );
  if (!link) return { removed: false, hadAutoGenerated: false, tagName: null };

  await db.delete(NoteTags).where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)));
  return {
    removed: true,
    hadAutoGenerated: link.isAutoGenerated === true,
    tagName: link.name,
  };
}
