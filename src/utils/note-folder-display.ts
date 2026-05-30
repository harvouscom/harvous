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
