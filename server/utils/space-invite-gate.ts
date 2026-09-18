/**
 * Who pays for a Shared Space's invite links.
 *
 * A personal Shared Space bills to its owner's Shared Spaces add-on. A church
 * Shared Space (`orgId` set) bills to the church — the staffer who happens to
 * own the row must never need a personal subscription for their church's small
 * group to invite people, which is what the old single gate required.
 *
 * A lapsed church refuses new invites like every other church write (402), and
 * says so in church terms rather than sending a volunteer to `/upgrade`.
 */
import type { Auth } from '../middleware/types';
import { CHURCH_LAPSED_CODE, CHURCH_LAPSED_ERROR, churchIsSponsored } from './church-entitlement';
import { getActiveChurchByOrgId } from './church-staff';
import { hasSharedSpacesAddOn } from './tier-limits';

export type SpaceInviteGateResult =
  | { ok: true }
  | { ok: false; status: 402 | 403 | 409; code: string; error: string; upgradeUrl?: string };

export async function assertCanCreateSpaceInvite(
  auth: Auth,
  space: { orgId: string | null },
): Promise<SpaceInviteGateResult> {
  if (space.orgId) {
    const church = await getActiveChurchByOrgId(space.orgId);
    if (!church || !church.isActive) {
      return { ok: false, status: 409, code: 'CHURCH_INACTIVE', error: 'This church is not active on Harvous' };
    }
    if (!churchIsSponsored(church)) {
      return { ok: false, status: 402, code: CHURCH_LAPSED_CODE, error: CHURCH_LAPSED_ERROR };
    }
    return { ok: true };
  }

  if (!(await hasSharedSpacesAddOn(auth))) {
    return {
      ok: false,
      status: 403,
      code: 'SHARED_SPACE_LIMIT_EXCEEDED',
      error: 'Owning shared spaces requires the Shared Spaces add-on. Joining spaces is always free.',
      upgradeUrl: '/upgrade',
    };
  }
  return { ok: true };
}
