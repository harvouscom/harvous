import { getSelectedSpaceId } from '@/components/react/navigation/selectedSpace';
import type { NavSpace } from '../hooks/queries/useNavigation';

function parseCreatedAtMs(s: NavSpace): number {
  const raw = s.createdAt;
  if (!raw) return 0;
  const t = Date.parse(typeof raw === 'string' ? raw : String(raw));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Resolves the user's personal “home” space id from owned spaces only (classic / native parity).
 * Order: title "My Home" → classic selected space if owned → oldest private owned → first owned.
 */
export function resolvePersonalHomeSpaceId(ownedSpaces: NavSpace[]): string | null {
  if (!ownedSpaces.length) return null;

  const byTitle = ownedSpaces.find((s) => s.title?.trim().toLowerCase() === 'my home');
  if (byTitle) return byTitle.id;

  const selected = getSelectedSpaceId();
  if (selected && ownedSpaces.some((s) => s.id === selected)) return selected;

  const privateOwned = ownedSpaces.filter((s) => s.isPublic !== true);
  const pool = privateOwned.length ? privateOwned : ownedSpaces;
  const sorted = [...pool].sort((a, b) => {
    const ta = parseCreatedAtMs(a);
    const tb = parseCreatedAtMs(b);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  return sorted[0]?.id ?? ownedSpaces[0]?.id ?? null;
}

/** Canonical label for space rows (matches native Space name casing). */
export function formatProtoSpaceRowTitle(title: string | null | undefined): string {
  const t = title?.trim() ?? '';
  if (t.toLowerCase() === 'my home') return 'My Home';
  return t || 'Untitled space';
}
