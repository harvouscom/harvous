/**
 * Which rooms speak for each other — the church's own decision.
 *
 * A ministry usually has two rooms: the Shared Space where its group meets and
 * the channel it broadcasts through. Nothing connected them, so the two lanes
 * in the hub above read as unrelated lists even when half the rows are the same
 * ministry twice.
 *
 * Staff-only, and staff-only in the hub rather than in either room's settings,
 * because the decision is about the church's shape rather than about one room —
 * and because pairing needs to see both lanes at once.
 *
 * The picker expands in place rather than opening a native select: the same
 * reason the planner's starter field stopped using one. A channel already
 * paired with another space is listed and disabled, so "why can't I pick that"
 * is answered where it is asked instead of by an error after the fact.
 */
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { useChannelLinks, useSetChannelLink } from '../../hooks/queries/useChannelLinks';

type Room = { id: string; title: string; color?: string | null };

export default function PrototypeChannelPairingSection({
  orgId,
  sharedSpaces,
  channels,
}: {
  orgId: string | null;
  sharedSpaces: Room[];
  channels: Room[];
}) {
  const { data } = useChannelLinks(orgId);
  const setLink = useSetChannelLink(orgId);
  const [openFor, setOpenFor] = useState<string | null>(null);

  /* Nothing to pair with is not an empty state worth explaining — a church with
     no channels has not met this idea yet, and a row saying so would be the
     first thing it ever heard about it. */
  if (!orgId || sharedSpaces.length === 0 || channels.length === 0) return null;

  const links = data?.links ?? [];
  const channelForSpace = new Map(links.map((link) => [link.space.id, link.channel]));
  const spaceForChannel = new Map(links.map((link) => [link.channel.id, link.space]));

  const apply = async (spaceId: string, channelSpaceId: string | null) => {
    setOpenFor(null);
    try {
      await setLink.mutateAsync({ spaceId, channelSpaceId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change that pairing');
    }
  };

  return (
    <div className="proto-home-section">
      <p className="proto-caption proto-home-section__eyebrow">Channels for spaces</p>
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools proto-home-cascade">
        {sharedSpaces.map((space) => {
          const paired = channelForSpace.get(space.id) ?? null;
          const isOpen = openFor === space.id;

          return (
            <div key={space.id} className="proto-channel-pairing__group">
              <button
                type="button"
                className="proto-church-tools__row"
                aria-expanded={isOpen}
                disabled={setLink.isPending}
                onClick={() => setOpenFor(isOpen ? null : space.id)}
              >
                <span className="proto-church-tools__row-icon" aria-hidden>
                  <Icon name="user-group" size={13} />
                </span>
                <span className="proto-church-tools__row-text">
                  <span className="pds-list-title proto-church-tools__row-title">
                    {space.title}
                  </span>
                  <span className="proto-caption proto-church-tools__row-meta">
                    {paired ? paired.title : 'No channel'}
                  </span>
                </span>
                <span className="proto-church-tools__row-chevron" aria-hidden>
                  <Icon name={isOpen ? 'caret-down' : 'caret-right'} size={11} />
                </span>
              </button>

              {isOpen ? (
                <ul className="proto-channel-pairing__options">
                  {channels.map((channel) => {
                    const claimedBy = spaceForChannel.get(channel.id);
                    const takenByOther = Boolean(claimedBy && claimedBy.id !== space.id);
                    const selected = paired?.id === channel.id;

                    return (
                      <li key={channel.id}>
                        <button
                          type="button"
                          className="proto-channel-pairing__option"
                          disabled={takenByOther || setLink.isPending}
                          onClick={() => void apply(space.id, selected ? null : channel.id)}
                        >
                          <Icon name="rss" size={11} aria-hidden />
                          <span className="proto-channel-pairing__option-name">
                            {channel.title}
                          </span>
                          {takenByOther ? (
                            <span className="proto-caption proto-channel-pairing__option-note">
                              {claimedBy!.title}
                            </span>
                          ) : null}
                          {selected ? <Icon name="check" size={11} aria-hidden /> : null}
                        </button>
                      </li>
                    );
                  })}
                  {paired ? (
                    <li>
                      <button
                        type="button"
                        className="proto-channel-pairing__option proto-channel-pairing__option--clear"
                        disabled={setLink.isPending}
                        onClick={() => void apply(space.id, null)}
                      >
                        <Icon name="xmark" size={11} aria-hidden />
                        <span className="proto-channel-pairing__option-name">No channel</span>
                      </button>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
