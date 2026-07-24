import type { NavSpace, NavigationData } from '../hooks/queries/useNavigation';
import { isMinistryBroadcastSpace } from './shared-space-capabilities';
import { isUnitedStatesCountryLabel } from '@/utils/us-states';

export type StaffChurchSummary = {
  orgId: string;
  churchName: string;
  churchCity?: string | null;
  churchState?: string | null;
  channelTitles: string[];
};

/** "City, ST" or "City, Country" for hub/settings — omits empties. */
export function formatChurchLocation(church: {
  churchCity?: string | null;
  churchState?: string | null;
  churchCountry?: string | null;
}): string | null {
  const city = church.churchCity?.trim() || '';
  const state = church.churchState?.trim() || '';
  const country = church.churchCountry?.trim() || '';
  const locality = city && state ? `${city}, ${state}` : city || state || '';

  if (locality && country) {
    // US directory rows already show state; don't append "United States".
    if (isUnitedStatesCountryLabel(country) && state) return locality;
    return `${locality}, ${country}`;
  }
  if (locality) return locality;
  if (country) return country;
  return null;
}

/** Church-scoped collaborative Shared Space (under My Church when orgId set). */
export function isChurchScopedSharedSpace(space: {
  type?: string | null;
  orgId?: string | null;
}): boolean {
  return space.type === 'shared' && Boolean(space.orgId);
}

/** Personal Shared Space under My Home (no church org). */
export function isPersonalSharedSpace(space: {
  type?: string | null;
  orgId?: string | null;
}): boolean {
  return space.type === 'shared' && !space.orgId;
}

/** Group org ministry channels the viewer hosts/joins — for Settings › My Church. */
export function staffChurchesFromNavSpaces(spaces: NavSpace[] | null | undefined): StaffChurchSummary[] {
  const byOrg = new Map<string, StaffChurchSummary>();
  for (const space of spaces ?? []) {
    if (!isMinistryBroadcastSpace(space) || !space.orgId) continue;
    const churchName = space.churchName?.trim() || 'Church';
    const existing = byOrg.get(space.orgId);
    if (existing) {
      if (!existing.channelTitles.includes(space.title)) {
        existing.channelTitles.push(space.title);
      }
      if (!existing.churchCity && space.churchCity) existing.churchCity = space.churchCity;
      if (!existing.churchState && space.churchState) existing.churchState = space.churchState;
      continue;
    }
    byOrg.set(space.orgId, {
      orgId: space.orgId,
      churchName,
      churchCity: space.churchCity ?? null,
      churchState: space.churchState ?? null,
      channelTitles: [space.title],
    });
  }
  return [...byOrg.values()].sort((a, b) =>
    a.churchName.localeCompare(b.churchName, undefined, { sensitivity: 'base' }),
  );
}

export function staffChurchChannelSummary(church: StaffChurchSummary): string {
  const n = church.channelTitles.length;
  if (n === 0) return 'Ministry channels';
  if (n === 1) return church.channelTitles[0]!;
  return `${n} ministry channels`;
}

/**
 * Home church for My Church mode (lock A). Prefers connectedOrgId when present;
 * staff pilot bridge: first staff church from nav when home is not connected yet.
 */
export function resolveMyChurchFromNav(options: {
  spaces?: NavSpace[] | null;
  memberOfSpaces?: NavSpace[] | null;
  connectedOrgId?: string | null;
}): StaffChurchSummary | null {
  const all = [...(options.spaces ?? []), ...(options.memberOfSpaces ?? [])];
  const churches = staffChurchesFromNavSpaces(all);
  if (churches.length === 0) return null;
  const connected = options.connectedOrgId?.trim();
  if (connected) {
    return churches.find((church) => church.orgId === connected) ?? churches[0]!;
  }
  return churches[0]!;
}

/** Spaces listed in the My Church hub for one org (ministry + church-scoped shared). */
export function churchHubSpacesForOrg(
  spaces: NavSpace[] | null | undefined,
  orgId: string | null | undefined,
): NavSpace[] {
  if (!orgId) return [];
  return (spaces ?? [])
    .filter(
      (space) =>
        space.orgId === orgId &&
        (isMinistryBroadcastSpace(space) || isChurchScopedSharedSpace(space)),
    )
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

/**
 * Church-scoped Shared Spaces the viewer owns or leads — for Settings › My Church.
 * Owned entries come from `spaces`; memberships need role owner|leader.
 */
export function staffedChurchSharedSpaces(
  navigation: Pick<NavigationData, 'spaces' | 'memberOfSpaces'> | null | undefined,
): NavSpace[] {
  if (!navigation) return [];
  const byId = new Map<string, NavSpace>();

  for (const space of navigation.spaces ?? []) {
    if (!isChurchScopedSharedSpace(space)) continue;
    byId.set(space.id, space);
  }

  for (const space of navigation.memberOfSpaces ?? []) {
    if (!isChurchScopedSharedSpace(space)) continue;
    if (space.role !== 'owner' && space.role !== 'leader') continue;
    if (!byId.has(space.id)) byId.set(space.id, space);
  }

  return [...byId.values()].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
  );
}
