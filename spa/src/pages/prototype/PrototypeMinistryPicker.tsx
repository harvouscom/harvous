/**
 * "Ministries you could follow" — the cold-start fix for a fresh connect.
 *
 * A congregant who connects to their church follows **zero** channels, so
 * "From your church" renders nothing until they find the hub and tap Follow.
 * That gap is real, but the obvious fix — auto-following everything on connect —
 * is the option that was **decided against** (Derek, Aug 2026: opted tracks, not
 * auto-follow-all). A congregant chooses which ministries they are part of, so
 * every channel they follow traces to a deliberate act.
 *
 * So: rows you may act on, not a step you must clear.
 *
 * - **Nothing is preselected**, because there is nothing to select — each row
 *   carries its own Follow. That is the whole difference between opted tracks
 *   and auto-follow-all wearing a checkbox.
 * - **Skipping is doing nothing.** There is no Skip button because none is
 *   needed: ignoring these rows leaves the viewer exactly where they were,
 *   which is why this needs no migration and no backfill.
 * - **The hub stays the way in, permanently.** These rows are a prompt at the
 *   one moment the question is natural, never the only door.
 *
 * Occupies the slot the empty "From your church" feed would otherwise leave
 * blank — where the consequence of following nothing is actually visible.
 *
 * Writes through the ordinary `useFollowChannel`, so the `role='member'` row it
 * creates is the same one the hub's Follow button produces. No new write path.
 */
import Icon from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useChurchChannels } from '../../hooks/queries/useChurchChannels';
import { useFollowChannel } from '../../hooks/mutations/useFollowChannel';

/** Enough to answer the question; more than this is a browse, and the hub does that. */
const MAX_OFFERED = 4;

export default function PrototypeMinistryPicker() {
  const { data } = useChurchChannels();
  const followChannel = useFollowChannel();

  /*
    Only channels the viewer could actually join. Staff already author in
    theirs, and anything already followed is not a choice to offer again — this
    prompt is about the ones they have not answered for.
  */
  const offerable = (data?.channels ?? [])
    .filter((channel) => !channel.isStaff && !channel.isFollowing)
    .slice(0, MAX_OFFERED);

  // Nothing to ask about — a church with no channels, or one already answered for.
  if (!data?.connected || offerable.length === 0) return null;

  return (
    <>
      {offerable.map((channel) => (
        <PrototypeHomeRow
          key={channel.id}
          icon="rss"
          title={channel.title}
          /* Says why the row is here, and that following is the viewer's call. */
          meta={['From your church', channel.description]}
          chevron={false}
          trailing={
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label={`Follow ${channel.title}`}
              disabled={followChannel.isPending}
              onClick={() => followChannel.mutate({ spaceId: channel.id, follow: true })}
            >
              <Icon name="plus" size={12} aria-hidden />
            </button>
          }
        />
      ))}
    </>
  );
}
