import { canonicalBookOrder } from '@/utils/scripture-osis';

/**
 * Biblical names too universal to drive memory-layer arcs, generative recall, passage net-new
 * tags, or fingerprint people/themes. Keep in sync with native `UniversalBibleEntities`.
 */

export const UNIVERSAL_BIBLE_ENTITY_NAMES = [
  'god',
  'jesus',
  'christ',
  'holy spirit',
  'lord',
  'the lord',
] as const;

export type UniversalBibleEntityName = (typeof UNIVERSAL_BIBLE_ENTITY_NAMES)[number];

export const UNIVERSAL_BIBLE_ENTITIES = new Set<string>(UNIVERSAL_BIBLE_ENTITY_NAMES);

/** True when a label is a universal biblical entity (case-insensitive). */
export function isUniversalBibleEntity(name: string): boolean {
  return UNIVERSAL_BIBLE_ENTITIES.has(name.trim().toLowerCase());
}

/** Drop universal entities; preserve first-seen order and original casing. */
export function filterUniversalBibleEntities(labels: string[]): string[] {
  return labels.filter((raw) => {
    const label = raw.trim();
    return label.length > 0 && !isUniversalBibleEntity(label);
  });
}

export interface PulseThemeRankItem {
  name: string;
  count: number;
}

/** True when a label matches a canonical Bible book name (e.g. John, Psalms, 1 Peter). */
export function isCanonicalBookName(name: string): boolean {
  return canonicalBookOrder(name.trim()) !== Number.POSITIVE_INFINITY;
}

/** Ranked discovery themes with universal biblical names and book titles removed (Admin Pulse / Usage). */
export function filterPulseDiscoveryThemes(
  items: PulseThemeRankItem[],
  limit = 10,
): PulseThemeRankItem[] {
  return items
    .filter((item) => !isUniversalBibleEntity(item.name) && !isCanonicalBookName(item.name))
    .slice(0, Math.max(0, limit));
}
