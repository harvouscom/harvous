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

/** First non–My Pile label: primary, then secondaries. Null if none (treat as “No folder”). */
export function effectiveNoteFolderLabel(note: NoteFolderLabelSource): string | null {
  const prim = (note.primaryFolder ?? note.primaryCollection)?.trim() ?? '';
  if (prim && !isMyPileDisplayTitle(prim)) return prim;
  const secondaries = note.secondaryFolders ?? note.secondaryCollections ?? [];
  for (const s of secondaries) {
    const t = (s ?? '').trim();
    if (t && !isMyPileDisplayTitle(t)) return t;
  }
  return null;
}
