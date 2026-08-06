/**
 * Who may see the teaching plan, who may reshape it, and which plans exist.
 *
 * The compact pane in the church hub and the expanded planner both need this
 * verdict, and they must agree: a board that lets you drag a card the sidebar
 * would have shown as read-only is worse than either surface alone. The hub
 * still derives its other panes' gates itself — this is only the planner's.
 */
import { useMemo } from 'react';
import { useNavigation } from './queries/useNavigation';
import { useProfile } from './queries/useProfile';
import { useChurchStaffStatus } from './queries/useChurchStaffStatus';
import { useChurchChannels } from './queries/useChurchChannels';
import { churchHubSpacesForOrg, resolveMyChurchFromNav } from '../lib/church-settings';
import { isMinistryBroadcastSpace } from '../lib/shared-space-capabilities';

/** A plan you can switch to: the church's own, or one room's. */
export type PlannableSpace = {
  id: string;
  title: string;
  /**
   * The space's own accent, so a picker can draw the same coloured tile the
   * space switcher does. Without it every row got one flat glyph, and the list
   * told you nothing about which room you were choosing.
   */
  color: string | null;
  /**
   * Channel or shared space. Both are plannable, but they are not the same
   * thing, and a picker that draws a broadcast glyph on a room that gathers is
   * saying something untrue about it.
   */
  ministry: boolean;
};

export type ChurchPlannerAccess = {
  orgId: string | null;
  churchName: string;
  /** `sermon_tools` — a teacher teaches from the plan without setting it. */
  canView: boolean;
  /** Fully writable: `manage_teaching_plan` and the church still sponsored. */
  canWrite: boolean;
  /**
   * Why it's read-only, when it is. Lapsed wins: it is the church-wide fact and
   * it is true for the pastor too, so it outranks the role reason.
   */
  readOnlyReason: 'lapsed' | 'role' | null;
  /** Server's `manage_templates` verdict — gates the editor's starter nudge. */
  canManageChurchTemplates: boolean;
  /** Ministry channels and church Shared Spaces, each able to carry its own plan. */
  plannableSpaces: PlannableSpace[];
  isLoading: boolean;
};

export function useChurchPlannerAccess(orgIdOverride?: string | null): ChurchPlannerAccess {
  const navQuery = useNavigation();
  const profileQuery = useProfile();
  const nav = navQuery.data;
  const profile = profileQuery.data;

  const church = useMemo(
    () =>
      resolveMyChurchFromNav({
        spaces: nav?.spaces,
        memberOfSpaces: nav?.memberOfSpaces,
        connectedOrgId: orgIdOverride ?? profile?.connectedOrgId,
        churchName: profile?.churchName,
        churchCity: profile?.churchCity,
        churchState: profile?.churchState,
      }),
    [
      nav?.spaces,
      nav?.memberOfSpaces,
      orgIdOverride,
      profile?.connectedOrgId,
      profile?.churchName,
      profile?.churchCity,
      profile?.churchState,
    ],
  );

  const orgId = orgIdOverride ?? church?.orgId ?? null;
  const { can: canChurch, isLoading: staffStatusLoading } = useChurchStaffStatus(orgId);
  const channelsQuery = useChurchChannels();

  /*
    Server's verdicts — never re-derived from the role string on the client.
    Two of them, because seeing the plan and setting it are different jobs: a
    teacher teaches from what's planned, a pastor decides what it is.
  */
  const canView = canChurch('sermon_tools');
  const canEdit = canChurch('manage_teaching_plan');
  /**
   * Lapsed gates *writes* only. The plan stays listed and the congregation
   * keeps its Sunday — losing a church's study is never how a lapse shows up.
   * Read off the channels payload rather than adding a billing request.
   */
  const lapsed = channelsQuery.data?.sponsorship?.state === 'lapsed';
  const readOnlyReason: 'lapsed' | 'role' | null = lapsed ? 'lapsed' : canEdit ? null : 'role';

  const plannableSpaces = useMemo(() => {
    const all = [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])];
    /* Both lanes are plannable: a church Shared Space gathers as surely as a
       ministry channel broadcasts. Ministry first — it is the lane whose whole
       point is a publishing rhythm. */
    const hubSpaces = churchHubSpacesForOrg(all, orgId);
    const ministry: PlannableSpace[] = [];
    const shared: PlannableSpace[] = [];
    for (const space of hubSpaces) {
      const isMinistry = isMinistryBroadcastSpace(space);
      const entry: PlannableSpace = {
        id: space.id,
        title: space.title,
        color: space.color ?? null,
        ministry: isMinistry,
      };
      if (isMinistry) ministry.push(entry);
      else shared.push(entry);
    }
    return [...ministry, ...shared];
  }, [nav?.spaces, nav?.memberOfSpaces, orgId]);

  return {
    orgId,
    churchName: church?.churchName ?? 'My Church',
    canView,
    canWrite: readOnlyReason === null,
    readOnlyReason,
    canManageChurchTemplates: canChurch('manage_templates') && !lapsed,
    plannableSpaces,
    isLoading: staffStatusLoading || navQuery.isLoading,
  };
}
