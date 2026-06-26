import { isMyPileDisplayTitle } from '@/utils/my-pile-thread';
import { normalizeFolderKey } from '@/utils/note-folder-display';

const RESERVED_UNSORTED_KEYS = new Set(['unsorted', 'no folder']);

/** Folder labels that cannot be used as user-created folder names. */
export function isReservedPrototypeFolderLabel(name: string | null | undefined): boolean {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return true;
  if (isMyPileDisplayTitle(trimmed)) return true;
  const key = normalizeFolderKey(trimmed);
  return RESERVED_UNSORTED_KEYS.has(key);
}

export function parsePrototypeEmptyFolderLabels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed || isReservedPrototypeFolderLabel(trimmed)) continue;
      const key = normalizeFolderKey(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializePrototypeEmptyFolderLabels(labels: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const trimmed = raw.trim();
    if (!trimmed || isReservedPrototypeFolderLabel(trimmed)) continue;
    const key = normalizeFolderKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return JSON.stringify(out);
}

export function folderLabelKeysEqual(a: string, b: string): boolean {
  return normalizeFolderKey(a) === normalizeFolderKey(b);
}

export function removePrototypeEmptyFolderLabel(labels: string[], folderName: string): string[] {
  const target = normalizeFolderKey(folderName);
  return labels.filter((label) => normalizeFolderKey(label) !== target);
}

export function addPrototypeEmptyFolderLabel(labels: string[], folderName: string): string[] {
  const trimmed = folderName.trim();
  if (!trimmed || isReservedPrototypeFolderLabel(trimmed)) return labels;
  if (labels.some((l) => folderLabelKeysEqual(l, trimmed))) return labels;
  return [...labels, trimmed];
}
