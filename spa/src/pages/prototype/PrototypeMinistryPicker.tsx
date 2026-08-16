/**
 * "Which of these are you part of?" — the cold-start fix for a fresh connect.
 *
 * A congregant who connects to their church follows **zero** channels, so
 * "From your church" renders nothing until they find the hub and tap Follow.
 * That gap is real, but the obvious fix — auto-following everything on connect —
 * is the option that was **decided against** (Derek, Aug 2026: opted tracks, not
 * auto-follow-all). A congregant chooses which ministries they are part of, so
 * every channel they follow traces to a deliberate act.
 *
 * So: a prompt, not a switch.
 *
 * - **Nothing is preselected.** That is the whole difference between opted
 *   tracks and auto-follow-all wearing a checkbox.
 * - **Skipping is a first-class outcome.** Someone who dismisses this is in
 *   exactly the state they are in today, which is why this needs no migration
 *   and no backfill.
 * - **The hub stays the way in, permanently.** This is a prompt at the one
 *   moment the question is natural, never the only door.
 *
 * Writes through the ordinary `useFollowChannel` — the `role='member'` row it
 * creates is the same one the hub's Follow button produces. No new write path.
 */
import { useCallback, useState } from 'react';
import Icon from '@/components/react/Icon';
import { useChurchChannels } from '../../hooks/queries/useChurchChannels';
import { useFollowChannel } from '../../hooks/mutations/useFollowChannel';

type Props = {
  /** Called when the viewer picks or skips — the host decides what to dismiss. */
  onDone?: () => void;
};

export default function PrototypeMinistryPicker({ onDone }: Props) {
  const { data } = useChurchChannels();
  const followChannel = useFollowChannel();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const toggle = useCallback((spaceId: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }, []);

  /*
    Only channels the viewer could actually join. Staff already author in
    theirs, and anything already followed is not a choice to offer again — this
    prompt is about the ones they have not answered for.
  */
  const offerable = (data?.channels ?? []).filter(
    (channel) => !channel.isStaff && !channel.isFollowing,
  );

  const follow = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      /* Sequential rather than parallel: each write invalidates navigation, and
         a burst of concurrent invalidations makes the sidebar flicker through
         several intermediate states on the way to the right one. */
      for (const spaceId of picked) {
        await followChannel.mutateAsync({ spaceId, follow: true });
      }
      onDone?.();
    } finally {
      setSaving(false);
    }
  }, [followChannel, onDone, picked, saving]);

  // Nothing to ask about — a church with no channels, or one already answered for.
  if (!data?.connected || offerable.length === 0) return null;

  return (
    <section className="proto-ministry-picker">
      <p className="pds-list-title proto-ministry-picker__title">
        Which of these are you part of?
      </p>
      {/* Says plainly that doing nothing is fine. Without this the prompt reads
          as a required step, which is the thing it is not. */}
      <p className="proto-caption proto-ministry-picker__subtitle">
        Pick any that apply, or skip — you can follow a ministry any time from My Church.
      </p>

      <div className="proto-ministry-picker__list">
        {offerable.map((channel) => {
          const checked = picked.has(channel.id);
          return (
            <label key={channel.id} className="proto-published-for__option">
              <input
                type="checkbox"
                className="proto-service-editor__slot-input"
                checked={checked}
                onChange={() => toggle(channel.id)}
              />
              <span className="proto-service-editor__slot-orb" aria-hidden>
                {checked ? (
                  <span className="proto-accent-check-orb proto-accent-check-orb--selected">
                    <Icon name="check" size={9} />
                  </span>
                ) : (
                  <span className="proto-select-orb-idle" />
                )}
              </span>
              <span className="proto-published-for__option-label">{channel.title}</span>
            </label>
          );
        })}
      </div>

      <div className="proto-sheet-footer__row">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={saving || picked.size === 0}
          onClick={follow}
        >
          {saving ? 'Following…' : picked.size > 1 ? `Follow ${picked.size}` : 'Follow'}
        </button>
        <button
          type="button"
          className="proto-sheet-quiet-action"
          disabled={saving}
          onClick={() => onDone?.()}
        >
          Skip
        </button>
      </div>
    </section>
  );
}
