/**
 * "Where does this note live?" — every destination at once, ticked or not.
 *
 * This began as a draft-only, single-select retarget picker. Two things were wrong with
 * that. It disappeared the moment the note saved, so the one control that answers "which
 * space is this in?" was unavailable for the entire life of the note. And it was a radio
 * group, which quietly asserted that a note lives in exactly one place — the opposite of
 * how the data actually works: the canonical row lives in My Home and each shared space is
 * a `SpaceNotes` association layered on top (see `lib/note-audience.ts`).
 *
 * **My Home is always ticked and never tappable.** Not a default the menu chose — there is
 * no state in which a note you authored is absent from your own Home, so offering to
 * untick it would be offering something that cannot happen.
 *
 * Rows come from `resolveNoteDestinationRows`, which is now the only copy of these rules.
 * Blocked rows stay *visible* rather than filtered out: a space you cannot post into is
 * still an answer to "why isn't this there?", and hiding it makes the absence look like a
 * bug in the list.
 */
import { useMemo, useState } from 'react';
import { defaultPublishAt, formatPublishAt, toDateTimeLocal } from '../../hooks/queries/useChurchContent';
import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import ProtoLoadingDots from './ProtoLoadingDots';
import { noteSpaceBlockedReasonLabel } from '../../lib/shared-note-membership';
import type { NoteDestinationRow } from '../../lib/shared-note-membership';
import type { NavSpace } from '../../hooks/queries/useNavigation';

export type NoteDestination = NoteDestinationRow<NavSpace>;

/** A channel post that is not live yet — waiting for its time, or for a pastor. */
export type ChannelPending = { submissionId: string; status: 'in_review' | 'scheduled'; publishAt: string | null };

/** A church channel: publishing there is what scheduling and approval are about. */
function isChannelRow(row: NoteDestination): boolean {
  return Boolean(row.space && row.space.type === 'public' && row.space.orgId);
}

/** Past this many rows, scanning beats reading — same threshold the old ⋯ submenu used. */
const FILTER_THRESHOLD = 5;

export default function PrototypeNoteDestinationSheet({
  open,
  rows,
  loading = false,
  pendingSpaceIds,
  onToggle,
  channelPending,
  approvalSpaceIds,
  canSchedule = false,
  onSchedule,
  onWithdraw,
}: {
  open: boolean;
  rows: NoteDestination[];
  /** Associations haven't arrived yet — show nothing rather than an empty audience. */
  loading?: boolean;
  /** Spaces with an association request in flight; their rows are inert meanwhile. */
  pendingSpaceIds?: ReadonlySet<string>;
  /* No `onDismiss`: the sheet is a sibling of its trigger inside
     `.proto-note-destination-anchor`, and the page dismisses on a pointerdown outside
     that anchor — which is the only way the trigger's own toggle can keep working. */
  onToggle: (destination: NoteDestination, nextChecked: boolean) => void;
  /** Channel posts not live yet, by channel id (docs/CHURCH_V2_ROADMAP.md §D). */
  channelPending?: ReadonlyMap<string, ChannelPending>;
  /** Channels whose church reviews this author's posts first. */
  approvalSpaceIds?: ReadonlySet<string>;
  /** The note exists on the server, so it can be scheduled. */
  canSchedule?: boolean;
  /** Schedule (or submit) for a channel; null publishAt = as soon as approved. */
  onSchedule?: (destination: NoteDestination, publishAt: string | null) => void;
  onWithdraw?: (destination: NoteDestination, pending: ChannelPending) => void;
}) {
  const [filter, setFilter] = useState('');
  /** The channel whose time picker is open, and the time in it. */
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [scheduleValue, setScheduleValue] = useState('');
  const showFilter = rows.length > FILTER_THRESHOLD;

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    // My Home always stays — it is the one row that is never a choice.
    return rows.filter((row) => row.isHome || row.title.toLowerCase().includes(q));
  }, [filter, rows]);

  if (!open) return null;

  return (
    <ProtoPopoverShell
      role="listbox"
      aria-label="Where this note is saved"
      aria-multiselectable
      className="proto-menu__popover proto-note-destination"
    >
      {showFilter ? (
        <div className="proto-note-destination__filter">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter spaces…"
            aria-label="Filter spaces"
          />
        </div>
      ) : null}

      <div className="proto-menu-section">
        {visible.map((row) => {
          const checked = row.state === 'added';
          const blocked = row.state === 'blocked';
          const pending = row.spaceId ? pendingSpaceIds?.has(row.spaceId) === true : false;
          const channel = isChannelRow(row);
          const waiting = row.spaceId ? channelPending?.get(row.spaceId) : undefined;
          const needsApproval = row.spaceId ? approvalSpaceIds?.has(row.spaceId) === true : false;
          /* My Home is inert by nature; a blocked space by rule; a pending one only until
             its request lands. `loading` covers the window where associations are unknown,
             where a tick would be drawn against a list we cannot vouch for. */
          const inert = row.isHome || blocked || pending || loading;
          const offerSchedule = channel && !checked && !blocked && !waiting && canSchedule && Boolean(onSchedule);
          const pickerOpen = scheduling === row.spaceId && offerSchedule;

          const waitingLabel = waiting
            ? waiting.status === 'in_review'
              ? waiting.publishAt
                ? `Waiting for approval · ${formatPublishAt(waiting.publishAt)}`
                : 'Waiting for approval'
              : `Scheduled · ${formatPublishAt(waiting.publishAt)}`
            : null;

          return (
            <div key={row.spaceId ?? '__home__'} className="proto-note-destination__item">
              <div className="proto-note-destination__line">
                <button
                  type="button"
                  role="option"
                  aria-selected={checked || Boolean(waiting)}
                  aria-disabled={inert || undefined}
                  className="proto-menu-item proto-note-destination__row"
                  disabled={inert}
                  title={
                    row.isHome
                      ? 'Every note lives in My Home'
                      : blocked && row.reason
                        ? noteSpaceBlockedReasonLabel(row.reason)
                        : waiting
                          ? waiting.status === 'in_review'
                            ? `Take back from ${row.title}`
                            : `Unschedule from ${row.title}`
                          : checked
                            ? `Remove from ${row.title}`
                            : needsApproval
                              ? `Submit to ${row.title} for approval`
                              : `Add to ${row.title}`
                  }
                  // Don't steal focus from the editor — the author is mid-sentence.
                  onMouseDown={(e) => e.preventDefault()}
                  /* Stays open on purpose. Ticking one space and being thrown out is the
                     single-select behaviour this replaced. */
                  onClick={() => {
                    if (waiting && onWithdraw) {
                      onWithdraw(row, waiting);
                      return;
                    }
                    if (!checked && needsApproval && onSchedule) {
                      onSchedule(row, null);
                      return;
                    }
                    onToggle(row, !checked);
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    {row.isHome ? (
                      <ProtoHouseIcon size={13} />
                    ) : (
                      <ProtoSpaceMenuIcon color={row.space?.color || 'paper'} />
                    )}
                  </span>
                  <span className="proto-note-destination__text">
                    <span className="proto-menu-item__label">{row.title}</span>
                    {waitingLabel ? <span className="proto-note-destination__meta">{waitingLabel}</span> : null}
                  </span>
                  <span className="proto-note-destination__check" aria-hidden>
                    {pending ? (
                      /* The shell's own loading vocabulary — a spinning glyph here was a
                         second one for the same wait. */
                      <ProtoLoadingDots />
                    ) : waiting ? (
                      <Icon name="clock" size={11} />
                    ) : checked ? (
                      <Icon name="check" size={11} />
                    ) : null}
                  </span>
                </button>
                {offerSchedule ? (
                  <button
                    type="button"
                    className="proto-note-destination__schedule"
                    aria-expanded={pickerOpen}
                    aria-label={`Schedule for ${row.title}`}
                    title={`Schedule for ${row.title}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (pickerOpen) {
                        setScheduling(null);
                        return;
                      }
                      setScheduling(row.spaceId);
                      setScheduleValue(toDateTimeLocal(defaultPublishAt()));
                    }}
                  >
                    <Icon name="clock" size={11} />
                  </button>
                ) : null}
              </div>
              {pickerOpen ? (
                <div className="proto-note-destination__picker">
                  <input
                    type="datetime-local"
                    aria-label={`When to publish to ${row.title}`}
                    value={scheduleValue}
                    min={toDateTimeLocal(new Date())}
                    onChange={(e) => setScheduleValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="proto-share-popover__primary proto-note-destination__picker-go"
                    disabled={!scheduleValue}
                    onClick={() => {
                      const at = new Date(scheduleValue);
                      if (Number.isNaN(at.getTime())) return;
                      setScheduling(null);
                      onSchedule?.(row, at.toISOString());
                    }}
                  >
                    {needsApproval ? 'Submit' : 'Schedule'}
                  </button>
                  {needsApproval ? (
                    <p className="proto-note-destination__hint">
                      A pastor approves it first, then it goes out at this time.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {loading ? (
          <p className="proto-note-destination__hint">Checking where this note is shared…</p>
        ) : null}
        {!loading && showFilter && filter.trim() && visible.length <= 1 ? (
          <p className="proto-note-destination__hint">No spaces match your search.</p>
        ) : null}
        {!loading && rows.length === 1 ? (
          <p className="proto-note-destination__hint">
            Notes you share with a space will show up here too.
          </p>
        ) : null}
      </div>
    </ProtoPopoverShell>
  );
}
