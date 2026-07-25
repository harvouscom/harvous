import type { NavSpace, NavigationData } from '../hooks/queries/useNavigation';
import { isMinistryBroadcastSpace } from './shared-space-capabilities';
import { isUnitedStatesCountryLabel } from '@/utils/us-states';
import { getRelativeTime } from '@/utils/date-formatting';
import { cadenceShortLabel, type PublishCadence } from '@/utils/channel-publish-cadence';

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

/**
 * Orgs the viewer can enter via My Church — ministry channels and/or
 * church-scoped Shared Spaces (both carry orgId). Personal Shared Spaces do not.
 */
export function staffChurchesFromNavSpaces(spaces: NavSpace[] | null | undefined): StaffChurchSummary[] {
  const byOrg = new Map<string, StaffChurchSummary>();
  for (const space of spaces ?? []) {
    if (!space.orgId) continue;
    if (!isMinistryBroadcastSpace(space) && !isChurchScopedSharedSpace(space)) continue;
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

/** Hub row meta for a ministry channel — latest activity + cadence cues. */
export function formatMinistryChannelTeaser(space: {
  publishCadence?: PublishCadence | null;
  cadenceStale?: boolean;
  lastCurriculumAt?: string | null;
}): string | null {
  const cadence = cadenceShortLabel(space.publishCadence ?? null);
  const raw = space.lastCurriculumAt?.trim();
  const lastAt = raw ? new Date(raw) : null;
  const relative =
    lastAt && !Number.isNaN(lastAt.getTime()) ? getRelativeTime(lastAt) : null;

  if (relative && cadence) {
    if (space.cadenceStale) return `${relative} · Quieter than ${cadence}`;
    return `${relative} · ${cadence}`;
  }
  if (relative) return relative;
  if (!cadence) return null;
  if (space.cadenceStale) return `${cadence} · Quiet lately`;
  return cadence;
}

/** Badge label for unseen notes (null when none). Caps at 9+. */
export function formatHubNewBadge(newNoteCount: number | null | undefined): string | null {
  const n = typeof newNoteCount === 'number' ? newNoteCount : 0;
  if (n <= 0) return null;
  return n > 9 ? '9+' : String(n);
}

/**
 * Home church for My Church mode (lock A). Prefers connectedOrgId when present;
 * connected with zero nav spaces still unlocks an empty hub via profile denorm.
 * Staff pilot bridge: first staff church from nav when home is not connected yet.
 */
export function resolveMyChurchFromNav(options: {
  spaces?: NavSpace[] | null;
  memberOfSpaces?: NavSpace[] | null;
  connectedOrgId?: string | null;
  /** Profile denorm — used when connected with no matching spaces yet. */
  churchName?: string | null;
  churchCity?: string | null;
  churchState?: string | null;
}): StaffChurchSummary | null {
  const all = [...(options.spaces ?? []), ...(options.memberOfSpaces ?? [])];
  const churches = staffChurchesFromNavSpaces(all);
  const connected = options.connectedOrgId?.trim() || null;

  if (connected) {
    const fromSpaces = churches.find((church) => church.orgId === connected);
    if (fromSpaces) return fromSpaces;
    return {
      orgId: connected,
      churchName: options.churchName?.trim() || 'My Church',
      churchCity: options.churchCity ?? null,
      churchState: options.churchState ?? null,
      channelTitles: [],
    };
  }

  if (churches.length === 0) return null;
  return churches[0]!;
}

/**
 * Whether the viewer can create a church Shared Space for this org from nav roles.
 * Owned ministry/church spaces, or owner|leader membership — not mere connection.
 */
export function canCreateChurchSharedSpaceFromNav(
  navigation: Pick<NavigationData, 'spaces' | 'memberOfSpaces'> | null | undefined,
  orgId: string | null | undefined,
): boolean {
  if (!orgId) return false;
  for (const space of navigation?.spaces ?? []) {
    if (space.orgId !== orgId) continue;
    if (isMinistryBroadcastSpace(space) || isChurchScopedSharedSpace(space)) return true;
  }
  for (const space of navigation?.memberOfSpaces ?? []) {
    if (space.orgId !== orgId) continue;
    if (!isMinistryBroadcastSpace(space) && !isChurchScopedSharedSpace(space)) continue;
    if (space.role === 'owner' || space.role === 'leader') return true;
  }
  return false;
}

/**
 * Staff can create church Shared Spaces / ministry channels for an org.
 * Nav roles, live/server staff flag, Clerk org membership, or home-church staff.
 */
export function canCreateChurchOrgContent(options: {
  navigation?: Pick<NavigationData, 'spaces' | 'memberOfSpaces'> | null;
  orgId?: string | null;
  connectedOrgId?: string | null;
  isHomeChurchStaff?: boolean | null;
  /** Live staff check for this orgId (API or Clerk membership). */
  isOrgStaff?: boolean | null;
}): boolean {
  const orgId = options.orgId?.trim();
  if (!orgId) return false;
  if (canCreateChurchSharedSpaceFromNav(options.navigation, orgId)) return true;
  if (options.isOrgStaff) return true;
  if (
    options.isHomeChurchStaff &&
    options.connectedOrgId?.trim() === orgId
  ) {
    return true;
  }
  return false;
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
