/**
 * Church join links: the one link (and QR) a church hands its congregation.
 *
 * A link shows the church before sign-up, carries a visitor through it, connects
 * them (`connectUserToChurch`) and lets them pick channels. Routes live in
 * server/routes/church-join.ts; the table's docblock in schema.ts says why it is a
 * token and not a slug, and why a link never expires.
 *
 * Who may do what, composed on `resolveChurchOrgAccess` so staff are proven before
 * anyone learns a church's billing state:
 *   - **view** — any staff member (`publish`). Every staffer may copy the link;
 *     handing it out is the point of it. Never sponsorship-gated.
 *   - **manage** — `manage_church_settings` (admin, coordinator), sponsorship-gated.
 *     Rotating kills every printed bulletin, which is administration, not teaching.
 *     Not `manage_staff`: that is the Clerk roster, which congregants never join.
 *   - **revoke** — the same role, never sponsorship-gated. A leaked link must be
 *     stoppable by a church that has lapsed.
 */

import { renderSVG } from 'uqr';
import {
  db,
  first,
  Churches,
  ChurchJoinLinks,
  Spaces,
  and,
  eq,
  isNull,
} from '../db';
import {
  resolveChurchOrgAccess,
  type ChurchOrgAccessResult,
  type ChurchOrgAccessRule,
} from './church-org-access';
import type { ChurchRow } from './church-staff';

export const CHURCH_JOIN_PATH_PREFIX = '/churches/join/';

/** How many channels a single redeem may follow — a bound, not a product limit. */
export const JOIN_FOLLOW_CAP = 20;

type ChurchJoinAccess = 'view' | 'manage' | 'revoke';

const CHURCH_JOIN_ACCESS: Record<ChurchJoinAccess, ChurchOrgAccessRule> = {
  view: {
    capability: 'publish',
    code: 'CHURCH_JOIN_LINK_FORBIDDEN',
    staffError: 'Only church staff can see the join link',
    roleError: 'Your role does not include the join link',
    sponsorshipGated: false,
  },
  manage: {
    capability: 'manage_church_settings',
    code: 'CHURCH_JOIN_LINK_ROLE_REQUIRED',
    staffError: 'Only church staff can change the join link',
    roleError: 'A church admin makes and replaces the join link',
    sponsorshipGated: true,
  },
  revoke: {
    capability: 'manage_church_settings',
    code: 'CHURCH_JOIN_LINK_ROLE_REQUIRED',
    staffError: 'Only church staff can turn off the join link',
    roleError: 'A church admin turns off the join link',
    sponsorshipGated: false,
  },
};

export function assertCanViewChurchJoinLink(userId: string, orgId: string): Promise<ChurchOrgAccessResult> {
  return resolveChurchOrgAccess(userId, orgId, CHURCH_JOIN_ACCESS.view);
}

export function assertCanManageChurchJoinLink(userId: string, orgId: string): Promise<ChurchOrgAccessResult> {
  return resolveChurchOrgAccess(userId, orgId, CHURCH_JOIN_ACCESS.manage);
}

export function assertCanRevokeChurchJoinLink(userId: string, orgId: string): Promise<ChurchOrgAccessResult> {
  return resolveChurchOrgAccess(userId, orgId, CHURCH_JOIN_ACCESS.revoke);
}

export type ChurchJoinLinkRow = typeof ChurchJoinLinks.$inferSelect;

/**
 * Join tokens avoid look-alike characters (0/O, 1/I/l). A share link is clicked; a join
 * link is also *typed*, off a bulletin or a slide, and "8JjSauUkLmQl" ending in a lower-case
 * L is the kind of thing a congregation retypes as a capital i. 12 characters from 57
 * is still ~70 bits.
 */
const JOIN_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const JOIN_TOKEN_LENGTH = 12;

export function generateChurchJoinToken(): string {
  const bytes = new Uint8Array(JOIN_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 is not a multiple of the alphabet size; rejection-free modulo bias here is
  // under 2% per character and irrelevant for an unguessable, rate-limited token.
  return Array.from(bytes, (b) => JOIN_TOKEN_ALPHABET[b % JOIN_TOKEN_ALPHABET.length]).join('');
}

export function churchJoinUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}${CHURCH_JOIN_PATH_PREFIX}${token}`;
}

/**
 * The QR as an SVG string. Always black on white — a coloured QR on a projected
 * slide or a cheap photocopy is the one that fails to scan — with the standard
 * four-module quiet zone and medium error correction (survives a fold or a smudge
 * without making the code dense). The bare URL, no query string, keeps it small.
 */
export function renderChurchJoinQrSvg(url: string): string {
  return renderSVG(url, { ecc: 'M', border: 4, whiteColor: '#ffffff', blackColor: '#000000' });
}

/** The church's live link, if it has one. */
export async function findLiveJoinLink(churchId: string): Promise<ChurchJoinLinkRow | null> {
  return (
    first(
      await db
        .select()
        .from(ChurchJoinLinks)
        .where(and(eq(ChurchJoinLinks.churchId, churchId), isNull(ChurchJoinLinks.revokedAt)))
        .limit(1),
    ) ?? null
  );
}

/** Sum of `useCount` across every link the church has had — "N joined via link". */
export async function totalJoinedViaLinks(churchId: string): Promise<number> {
  const rows = await db
    .select({ useCount: ChurchJoinLinks.useCount })
    .from(ChurchJoinLinks)
    .where(eq(ChurchJoinLinks.churchId, churchId));
  return rows.reduce((sum, row) => sum + (row.useCount ?? 0), 0);
}

export type ResolvedJoinLink =
  | { ok: true; link: ChurchJoinLinkRow; church: ChurchRow }
  | { ok: false; status: 404 | 410; code: 'NOT_FOUND' | 'JOIN_LINK_NOT_ACTIVE'; error: string };

/**
 * Pure: is this link still one a visitor may use? A revoked link, and a link whose
 * church is gone or switched off, answer the same way — and neither names the church.
 */
export function joinLinkDeadReason(
  link: Pick<ChurchJoinLinkRow, 'revokedAt'>,
  church: Pick<ChurchRow, 'isActive' | 'deletedAt'> | null,
): string | null {
  if (link.revokedAt) return 'This link is no longer active';
  if (!church || church.deletedAt || !church.isActive) return 'This link is no longer active';
  return null;
}

/** Look a token up and decide whether it still works. */
export async function resolveJoinLinkToken(token: string): Promise<ResolvedJoinLink> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 64) {
    return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Link not found' };
  }
  const link = first(
    await db.select().from(ChurchJoinLinks).where(eq(ChurchJoinLinks.token, trimmed)).limit(1),
  );
  if (!link) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Link not found' };

  const church =
    first(await db.select().from(Churches).where(eq(Churches.id, link.churchId)).limit(1)) ?? null;
  const dead = joinLinkDeadReason(link, church);
  if (dead || !church) {
    return { ok: false, status: 410, code: 'JOIN_LINK_NOT_ACTIVE', error: dead ?? 'This link is no longer active' };
  }
  return { ok: true, link, church };
}

export type FollowableChannel = {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  /** Its ministry, or null when church-wide. Archived ministries read as null at the preview. */
  ministryId: string | null;
};

/**
 * The channels a join link offers and may follow: the church's active ministry
 * channels, alphabetical.
 *
 * The one place the join flow decides which channels are on offer. When channels
 * gain an audience (docs/CHURCH_V2_ROADMAP.md §C3) a restricted channel drops out
 * here, and the preview and the redeem both follow.
 */
export async function followableChannelsForChurch(orgId: string): Promise<FollowableChannel[]> {
  const rows = await db
    .select({
      id: Spaces.id,
      title: Spaces.title,
      description: Spaces.description,
      color: Spaces.color,
      ministryId: Spaces.ministryId,
      isActive: Spaces.isActive,
    })
    .from(Spaces)
    .where(and(eq(Spaces.orgId, orgId), eq(Spaces.type, 'public'), isNull(Spaces.deletedAt)));
  return rows
    .filter((row) => row.isActive)
    .map(({ id, title, description, color, ministryId }) => ({ id, title, description, color, ministryId }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    .slice(0, JOIN_FOLLOW_CAP);
}

/**
 * Pure: the channel ids a redeem will actually follow — only ones the link offers,
 * each once, in the order asked. Anything else in the request is dropped silently:
 * a stale page asking for a channel that has since gone is not an error worth
 * failing someone's connection over.
 */
export function pickChannelsToFollow(
  requested: unknown,
  offered: ReadonlyArray<{ id: string }>,
): string[] {
  if (!Array.isArray(requested)) return [];
  const offeredIds = new Set(offered.map((channel) => channel.id));
  const picked: string[] = [];
  for (const value of requested) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!offeredIds.has(id) || picked.includes(id)) continue;
    picked.push(id);
    if (picked.length >= JOIN_FOLLOW_CAP) break;
  }
  return picked;
}

export type JoinRedeemPlan =
  | { action: 'connect' }
  | { action: 'already_connected' }
  | { action: 'confirm_switch' };

/**
 * Pure: what a redeem should do for this viewer. Someone connected to another
 * church is asked first — switching releases their old church's channel follows,
 * and a scanned QR is not consent to that.
 */
export function planJoinRedeem(input: {
  viewerConnectedChurchId: string | null | undefined;
  churchId: string;
  confirmSwitch: boolean;
}): JoinRedeemPlan {
  const current = input.viewerConnectedChurchId?.trim() || null;
  if (current === input.churchId) return { action: 'already_connected' };
  if (current && !input.confirmSwitch) return { action: 'confirm_switch' };
  return { action: 'connect' };
}

/** Pure: how the preview describes the viewer's relationship to this church. */
export function viewerChurchConnection(
  viewerConnectedChurchId: string | null | undefined,
  churchId: string,
): 'here' | 'elsewhere' | 'none' {
  const current = viewerConnectedChurchId?.trim() || null;
  if (!current) return 'none';
  return current === churchId ? 'here' : 'elsewhere';
}
