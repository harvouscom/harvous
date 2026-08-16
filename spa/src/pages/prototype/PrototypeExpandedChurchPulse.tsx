/**
 * The church's Pulse — how the teaching is going, in one place.
 *
 * Two questions a pastor actually asks, which used to be two separate rows in the hub's tools
 * list and two separate cramped drilldowns: *where have we been dwelling*, and *how many
 * people are with us*. Neither is a thing you configure or act on; both are things you look
 * at, and looking is what the expanded pane is for. A heat map of the canon in a 304px
 * sidebar was the wrong room for it.
 *
 * **Named for the question, not the instrument.** "Scripture map" and "Engagement" described
 * two widgets; a pastor opening this wants a read on the church, and the answer happens to be
 * drawn two ways.
 *
 * **The two halves keep their own gates, and that is the point.** A teacher may see where the
 * church has been teaching — it is the plan they teach from, folded by book. Only an admin
 * sees the counts. Merging the surfaces must not merge the permissions, so each section asks
 * its own question and a teacher simply sees one panel where an admin sees two.
 *
 * The privacy line is unchanged and is stated where staff read it: counts are of people, never
 * of notes, and never of *which* people. "Review is never shared" survives the reorganisation
 * because neither section learned a new question — this file adds no request of its own.
 */
import ProtoSidebarExpandedPanel from './ProtoSidebarExpandedPanel';
import type { ExpandedSidebarToolProps } from './PrototypeExpandedSidebarHost';
import PrototypeChurchScriptureMapSection from './PrototypeChurchScriptureMapSection';
import PrototypeChurchEngagementSection from './PrototypeChurchEngagementSection';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import { useChurchPlannerAccess } from '../../hooks/useChurchPlannerAccess';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';

export default function PrototypeExpandedChurchPulse({ exiting, onClose }: ExpandedSidebarToolProps) {
  const { orgId, churchName } = useChurchPlannerAccess();
  const { can } = useChurchStaffStatus(orgId);

  /* The same two verdicts the hub rows used, read from the server's capability payload and
     never re-derived from a role string. */
  const canSeeMap = can('sermon_tools');
  const canSeeCounts = can('manage_staff');

  return (
    <ProtoSidebarExpandedPanel
      label="Pulse"
      title="Pulse"
      scope={churchName}
      exiting={exiting}
      onClose={onClose}
    >
      <div className="proto-church-pulse">
        {canSeeMap ? (
          <PrototypeChurchScriptureMapSection orgId={orgId} canView={canSeeMap} />
        ) : null}
        {canSeeCounts ? (
          <PrototypeChurchEngagementSection orgId={orgId} canView={canSeeCounts} />
        ) : null}
        {!canSeeMap && !canSeeCounts ? (
          /* Reachable only if capabilities change while the pane is open — the row that opens
             this is gated on the same two verdicts. Says so rather than showing a blank pane. */
          <PrototypeListEmptyState
            iconName="chart-simple"
            title="Nothing to show yet"
            description="Your role does not include the church's teaching overview."
          />
        ) : null}
      </div>
    </ProtoSidebarExpandedPanel>
  );
}
