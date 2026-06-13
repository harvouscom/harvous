import { isMyPileDisplayTitle } from '@/utils/my-pile-thread';

/**
 * Notes may expose folder membership either as prototype-oriented names (`primaryFolder`)
 * or API/sync field names (`primaryCollection`).
 */
export type NoteFolderLabelSource = {
  primaryFolder?: string | null;
  secondaryFolders?: string[] | null;
  primaryCollection?: string | null;
  secondaryCollections?: string[] | null;
};

/** Ordered folder labels (primary, then secondaries). Skips My Pile; dedupes. Used for folder index + drill-down. */
export function noteFolderMembershipLabels(note: NoteFolderLabelSource): string[] {
  const out: string[] = [];
  const add = (raw: string | null | undefined) => {
    const t = (raw ?? '').trim();
    if (!t || isMyPileDisplayTitle(t)) return;
    if (!out.includes(t)) out.push(t);
  };
  add(note.primaryFolder ?? note.primaryCollection);
  for (const s of note.secondaryFolders ?? note.secondaryCollections ?? []) {
    add(s);
  }
  return out;
}

/** First non–My Pile label: primary, then secondaries. Null if none (treat as “No folder”). */
export function effectiveNoteFolderLabel(note: NoteFolderLabelSource): string | null {
  const labels = noteFolderMembershipLabels(note);
  return labels[0] ?? null;
}

/** Additional folder count for toolbar chip (native `folderChipAdditionalCount`). */
export function noteFolderChipAdditionalCount(note: NoteFolderLabelSource): number {
  const labels = noteFolderMembershipLabels(note);
  return labels.length <= 1 ? 0 : labels.length - 1;
}

/** Whether a note belongs to a folder drill bucket (`null` = Unsorted / no folder). */
export function noteBelongsToFolderBucket(
  note: NoteFolderLabelSource,
  folderKey: string | null,
): boolean {
  const labels = noteFolderMembershipLabels(note);
  if (folderKey === null) return labels.length === 0;
  return labels.includes(folderKey);
}

/** Count notes in a folder drill bucket across a loaded note list. */
export function countNotesInFolderBucket(
  notes: NoteFolderLabelSource[],
  folderKey: string | null,
): number {
  return notes.filter((note) => noteBelongsToFolderBucket(note, folderKey)).length;
}

/** Toolbar folder chip: primary label, +N overflow, and full list for accessibility. */
export function noteFolderChipDisplayState(note: NoteFolderLabelSource): {
  label: string | null;
  extraCount: number;
  membershipLabels: string[];
} {
  const membershipLabels = noteFolderMembershipLabels(note);
  return {
    label: membershipLabels[0] ?? null,
    extraCount: membershipLabels.length <= 1 ? 0 : membershipLabels.length - 1,
    membershipLabels,
  };
}
