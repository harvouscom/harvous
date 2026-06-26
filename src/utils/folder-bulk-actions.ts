import { noteBelongsToFolderBucket, type NoteFolderLabelSource } from '@/utils/note-folder-display';

export type NoteFolderFields = NoteFolderLabelSource & {
  collectionPinned?: boolean;
  collectionUserOverride?: boolean;
};

export type NoteFolderRemovalPatch = {
  primaryCollection: string | null;
  secondaryCollections: string[];
  collectionPinned: boolean;
  collectionUserOverride: boolean;
  /** Cleared when the note becomes fully unlabeled after removal. */
  collectionLastAutoUpdatedAt?: null;
};

export type NoteFolderAdditionPatch = {
  primaryCollection: string | null;
  secondaryCollections: string[];
  collectionUserOverride: boolean;
};

function folderLabelsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function readPrimary(note: NoteFolderLabelSource): string {
  return (note.primaryCollection ?? note.primaryFolder ?? '').trim();
}

function readSecondaries(note: NoteFolderLabelSource): string[] {
  return [...(note.secondaryCollections ?? note.secondaryFolders ?? [])];
}

/** Whether a note belongs to a named folder bucket (case-insensitive label match). */
export function noteInNamedFolderBucket(note: NoteFolderLabelSource, folderName: string): boolean {
  const trimmed = folderName.trim();
  if (!trimmed) return false;
  const primary = readPrimary(note);
  if (primary && folderLabelsEqual(primary, trimmed)) return true;
  return readSecondaries(note).some((s) => folderLabelsEqual(s, trimmed));
}

/**
 * Compute collection-field updates to remove `folderName` from a note.
 * Returns null when the note is not in the bucket. Notes are not deleted.
 */
export function computeNoteFolderRemovalPatch(
  note: NoteFolderFields,
  folderName: string,
): NoteFolderRemovalPatch | null {
  const bucket = folderName.trim();
  if (!bucket) return null;
  if (!noteInNamedFolderBucket(note, bucket)) return null;

  let nextPrimary: string | null = readPrimary(note) || null;
  if (nextPrimary && folderLabelsEqual(nextPrimary, bucket)) {
    nextPrimary = null;
  }

  const nextSecondaries = readSecondaries(note)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !folderLabelsEqual(s, bucket));

  const fullyUnlabeled = !nextPrimary && nextSecondaries.length === 0;

  return {
    primaryCollection: nextPrimary,
    secondaryCollections: nextSecondaries,
    collectionPinned: fullyUnlabeled ? false : Boolean(note.collectionPinned),
    collectionUserOverride: fullyUnlabeled ? false : Boolean(note.collectionUserOverride),
    ...(fullyUnlabeled ? { collectionLastAutoUpdatedAt: null as const } : {}),
  };
}

/**
 * Compute collection-field updates to add `folderName` to a note.
 * Returns null when the note is already in the bucket or folderName is empty.
 */
export function computeNoteFolderAdditionPatch(
  note: NoteFolderFields,
  folderName: string,
): NoteFolderAdditionPatch | null {
  const bucket = folderName.trim();
  if (!bucket) return null;
  if (noteInNamedFolderBucket(note, bucket)) return null;

  const primary = readPrimary(note);
  if (!primary) {
    return {
      primaryCollection: bucket,
      secondaryCollections: readSecondaries(note)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
      collectionUserOverride: true,
    };
  }

  const nextSecondaries = [...readSecondaries(note).map((s) => s.trim()).filter((s) => s.length > 0)];
  if (!nextSecondaries.some((s) => folderLabelsEqual(s, bucket))) {
    nextSecondaries.push(bucket);
  }

  return {
    primaryCollection: primary,
    secondaryCollections: nextSecondaries,
    collectionUserOverride: true,
  };
}

/** Notes belonging to a folder drill bucket (`null` = Unsorted). */
export function notesInFolderBucket<T extends NoteFolderLabelSource>(
  notes: T[],
  folderKey: string | null,
): T[] {
  return notes.filter((note) => noteBelongsToFolderBucket(note, folderKey));
}
