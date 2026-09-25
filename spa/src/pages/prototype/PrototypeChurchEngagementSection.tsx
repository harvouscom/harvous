/**
 * Engagement in the My Church hub — roadmap item 12, "later, carefully".
 *
 * **Counts, and nothing that could become a name.** A church sees how many
 * people are connected and how many follow each channel. It never sees who,
 * and it never sees a number about notes: "Review is never shared" is the
 * privacy principle for all church analytics, and the server has no endpoint
 * that would answer the question.
 *
 * The copy carries that on purpose. A pane of bare numbers invites the reading
 * that more of them exist somewhere, so the last line says plainly what this
 * will never show — a promise to the congregation, made where staff read it.
 *
 * Admin-only (`manage_staff`), the narrowest audience that makes it useful.
 */
import Icon from '@/components/react/Icon';
import { useChurchEngagement, type ChannelEngagement } from '../../hooks/queries/useChurchEngagement';
import { useChurchMinistries } from '../../hooks/queries/useChurchMinistries';
import ProtoSpaceLoading from './ProtoSpaceLoading';

export default function PrototypeChurchEngagementSection({
  orgId,
  canView,
}: {
  orgId: string | null;
  /** Server's `manage_staff` verdict — gates the request, not just the render. */
  canView: boolean;
}) {
  const { data, isPending } = useChurchEngagement(orgId, { enabled: canView });
  /* Names for the ministry headings — the same read the Ministries tool makes, usually cached. */
  const ministriesQuery = useChurchMinistries(orgId, { enabled: canView });

  /*
    Gated on `canView` because a disabled query stays `isPending` forever in
    React Query v5 — an admin sees dots while the counts land, everyone else
    sees the nothing they saw before.
  */
  if (!data) return canView && isPending ? <ProtoSpaceLoading label="Loading engagement" /> : null;

  const { connectedCount, channels } = data;
  const following = channels.reduce((sum, channel) => sum + channel.followerCount, 0);

  return (
    <div className="proto-home-section">
      <div className="proto-church-tools__lane-head">
        <p className="proto-caption proto-home-section__eyebrow">
          {connectedCount === 1 ? '1 person connected' : `${connectedCount} people connected`}
        </p>
      </div>

      {connectedCount === 0 ? (
        <p className="proto-caption proto-teaching-plan__empty">
          Nobody has made {data.church.name} their home church yet. They appear here as a
          count once they do.
        </p>
      ) : null}

      {channels.length > 0 ? (
        groupByMinistry(channels, ministriesQuery.data?.ministries ?? []).map((group) => (
          <div key={group.id ?? 'church-wide'} className="proto-church-engagement__group">
            {group.name ? <p className="proto-caption proto-church-engagement__group-name">{group.name}</p> : null}
            <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools">
              {group.channels.map((channel) => (
                /*
                  A row, not a bar chart. A church with 9 followers and one with 900
                  both want to read a number; a bar would invite comparing ministries
                  against each other, which is not what this is for.
                */
                <div key={channel.spaceId} className="proto-church-tools__row proto-church-tools__row--status">
                  <span className="proto-church-tools__row-icon" aria-hidden>
                    <Icon name="rss" size={13} />
                  </span>
                  <span className="proto-church-tools__row-text">
                    <span className="pds-list-title proto-church-tools__row-title proto-marquee" title={channel.title}><span>{channel.title}</span></span>
                    <span className="proto-caption proto-church-tools__row-meta proto-marquee-self">
                      {channel.followerCount === 1 ? '1 follower' : `${channel.followerCount} followers`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p className="proto-caption proto-teaching-plan__empty">
          No channels yet. Once you have one, its reach shows here.
        </p>
      )}

      {/*
        The promise, stated where it matters. Staff who read "42 connected" will
        wonder what else Harvous knows; the honest answer is the reassuring one,
        and saying it here is worth more than any number above it.
      */}
      <p className="proto-caption proto-church-engagement__note">
        {following > 0
          ? 'Counts only. Harvous never shows a church who wrote what, or whether anyone did.'
          : 'Harvous never shows a church who wrote what, or whether anyone did.'}
      </p>
    </div>
  );
}

/**
 * Channels under their ministry's name, church-wide last. With no ministries, one unheaded
 * group — the list it always was. Grouped, never ranked: the order within each stays the server's.
 */
function groupByMinistry(
  channels: ChannelEngagement[],
  ministries: ReadonlyArray<{ id: string; name: string; archivedAt: string | null }>,
) {
  const live = ministries.filter((m) => !m.archivedAt);
  const groups = live
    .map((m) => ({ id: m.id as string | null, name: m.name as string | null, channels: channels.filter((c) => c.ministryId === m.id) }))
    .filter((group) => group.channels.length > 0);
  const placed = new Set(groups.flatMap((group) => group.channels.map((c) => c.spaceId)));
  const rest = channels.filter((c) => !placed.has(c.spaceId));
  if (rest.length) groups.push({ id: null, name: groups.length ? 'Church-wide' : null, channels: rest });
  return groups;
}
