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
import { useChurchServiceChoice } from '../../hooks/queries/useChurchServiceChoice';
import { formatServiceTime } from '../../lib/church-services';

/** Enough to answer the question; more than this is a browse, and the hub does that. */
const MAX_OFFERED = 4;

export default function PrototypeMinistryPicker() {
  const { data } = useChurchChannels();
  const followChannel = useFollowChannel();
  const { data: service } = useChurchServiceChoice({ enabled: Boolean(data?.connected) });

  /*
    What meets during the viewer's own service comes first, and says so — "During your 9:00".
    Ordering and a label, never a preselection: each row still waits for its own tap.
  */
  const duringMine = new Set(service?.meetsDuringSpaceIds ?? []);
  const myTime = service?.choice ? formatServiceTime(service.choice.startTime) : null;
  const duringLabel = myTime ? `During your ${myTime} service` : null;
  const leadsWithMine = <T,>(ids: (row: T) => string[]) => (a: T, b: T) =>
    Number(ids(b).some((id) => duringMine.has(id))) - Number(ids(a).some((id) => duringMine.has(id)));

  /*
    Only channels the viewer could actually join. Staff already author in
    theirs, and anything already followed is not a choice to offer again — this
    prompt is about the ones they have not answered for.
  */
  const open = (data?.channels ?? []).filter((channel) => !channel.isStaff && !channel.isFollowing);
  const openIds = new Set(open.map((channel) => channel.id));

  /*
    A church with ministries is answered a ministry at a time — "I'm in Youth" is the question
    a congregant can actually answer — and one tap follows that ministry's open channels. Channels
    in no ministry are still offered one by one.
  */
  const ministryRows = (data?.ministries ?? [])
    .map((ministry) => ({ ...ministry, openIds: ministry.channelIds.filter((id) => openIds.has(id)) }))
    .filter((ministry) => ministry.openIds.length > 0)
    .sort(leadsWithMine((ministry) => ministry.openIds));
  const inMinistry = new Set((data?.ministries ?? []).flatMap((ministry) => ministry.channelIds));
  const channelRows = open
    .filter((channel) => !inMinistry.has(channel.id))
    .sort(leadsWithMine((channel) => [channel.id]));
  const offeredMinistries = ministryRows.slice(0, MAX_OFFERED);
  const offeredChannels = channelRows.slice(0, Math.max(0, MAX_OFFERED - offeredMinistries.length));

  if (!data?.connected) return null;

  /*
    A lapsed church refuses new follows (402), so a Follow here could only fail. Nothing to act
    on is nothing to show; what is already followed stays readable.
  */
  const followsOpen = data.sponsorship?.state !== 'lapsed';

  if (!followsOpen || offeredMinistries.length + offeredChannels.length === 0) {
    /*
      Following, but nothing has been posted yet — a church that just set up its channels. Without
      this the slot was blank, which read as "connecting did nothing". One quiet row says the follow
      worked and the wait is the church's, not a bug.
    */
    const followedCount = (data.channels ?? []).filter((channel) => channel.isFollowing).length;
    if (followedCount === 0) return null;
    return (
      <PrototypeHomeRow
        icon="rss"
        title={followedCount === 1 ? 'Following 1 channel' : `Following ${followedCount} channels`}
        meta={['From your church', 'Nothing posted yet']}
        chevron={false}
      />
    );
  }

  async function followAll(ids: string[]) {
    for (const spaceId of ids) {
      await followChannel.mutateAsync({ spaceId, follow: true }).catch(() => undefined);
    }
  }

  return (
    <>
      {offeredMinistries.map((ministry) => (
        <PrototypeHomeRow
          key={ministry.id}
          icon="layer-group"
          title={ministry.name}
          meta={[
            ministry.openIds.some((id) => duringMine.has(id)) && duringLabel ? duringLabel : 'From your church',
            ministry.openIds.length === 1 ? '1 channel' : `${ministry.openIds.length} channels`,
          ]}
          chevron={false}
          trailing={
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label={`Follow ${ministry.name}`}
              disabled={followChannel.isPending}
              onClick={() => void followAll(ministry.openIds)}
            >
              <Icon name="plus" size={12} aria-hidden />
            </button>
          }
        />
      ))}
      {offeredChannels.map((channel) => (
        <PrototypeHomeRow
          key={channel.id}
          icon="rss"
          title={channel.title}
          /* Says why the row is here, and that following is the viewer's call. */
          meta={[duringMine.has(channel.id) && duringLabel ? duringLabel : 'From your church', channel.description]}
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
