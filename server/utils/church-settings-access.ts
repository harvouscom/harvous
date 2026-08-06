/**
 * Who may see, and who may change, a church's own configuration.
 *
 * Composes `resolveChurchOrgAccess` rather than re-implementing its order:
 * church exists → active → **staff** → [write only: sponsored] → Clerk role →
 * capability. Staff-before-sponsorship survives by construction, so a
 * signed-in stranger never learns whether a church has lapsed.
 *
 * The read is gated on `publish` on purpose. Every staff role holds it —
 * including a staff member Clerk has never heard of, since
 * `capabilitiesForChurchRole(null)` is publish-only — so this reads as "any
 * staff member". Nothing here is sensitive, and a teacher looking at the
 * teaching plan needs to know what time the church meets.
 *
 * The write is `manage_church_settings`: admin-only, and sponsorship-gated like
 * every other church write.
 */
import {
  resolveChurchOrgAccess,
  type ChurchOrgAccessResult,
  type ChurchOrgAccessRule,
} from './church-org-access';

type ChurchSettingsAccess = 'view' | 'manage';

const CHURCH_SETTINGS_ACCESS: Record<ChurchSettingsAccess, ChurchOrgAccessRule> = {
  view: {
    capability: 'publish',
    code: 'CHURCH_SETTINGS_FORBIDDEN',
    staffError: 'Only church staff can see these settings',
    roleError: 'Your role does not include church settings',
    sponsorshipGated: false,
  },
  manage: {
    capability: 'manage_church_settings',
    code: 'CHURCH_SETTINGS_ROLE_REQUIRED',
    staffError: 'Only church staff can change these settings',
    roleError: 'A church admin sets your times',
    sponsorshipGated: true,
  },
};

export type ChurchSettingsGateResult = ChurchOrgAccessResult;

/** Any staff member may read the church's settings. Never sponsorship-gated. */
export function assertCanViewChurchSettings(
  userId: string,
  orgId: string,
): Promise<ChurchSettingsGateResult> {
  return resolveChurchOrgAccess(userId, orgId, CHURCH_SETTINGS_ACCESS.view);
}

/** Only a church admin may change them, and only while the church is sponsored. */
export function assertCanManageChurchSettings(
  userId: string,
  orgId: string,
): Promise<ChurchSettingsGateResult> {
  return resolveChurchOrgAccess(userId, orgId, CHURCH_SETTINGS_ACCESS.manage);
}
