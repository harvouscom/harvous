/**
 * "Use this study" — the curriculum handoff, on a channel's study plan.
 *
 * A follower takes the plan into their own study; a small-group leader hands it
 * to their group. Both are copies (see `useCopyStudyPlan`). The destinations are
 * only places the server will accept: My Home, and Shared Spaces the viewer owns
 * or leads.
 *
 * The destinations are a menu anchored to whatever opened them — the follower's
 * action button, or staff's ⋯ — the same popover every other thread action uses.
 * They used to spill into the header as a grid of buttons beside Add a note.
 */
import { useMemo, useRef, useState, type RefObject } from 'react';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useCopyStudyPlan } from '../../hooks/mutations/useCopyStudyPlan';
import { toastError } from '../../lib/error-copy';
import PrototypeSidebarRowMenuPopover, { TRIGGER_ANCHOR_MIN_WIDTH } from './PrototypeSidebarRowMenuPopover';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoHouseIcon from './ProtoHouseIcon';

type Destination = { id: string | null; title: string };

function useCopyDestinations(): Destination[] {
  const { data: nav } = useNavigation();
  return useMemo(() => {
    const groups: Destination[] = [];
    for (const space of nav?.spaces ?? []) {
      if (space.type === 'shared') groups.push({ id: space.id, title: space.title });
    }
    for (const space of nav?.memberOfSpaces ?? []) {
      if (space.type === 'shared' && (space.role === 'owner' || space.role === 'leader')) {
        groups.push({ id: space.id, title: space.title });
      }
    }
    return [{ id: null, title: 'My Home' }, ...groups];
  }, [nav?.spaces, nav?.memberOfSpaces]);
}

/** The destination menu. The caller owns `open` and the element it hangs from. */
export function StudyPlanCopyMenu({
  channelSpaceId,
  threadId,
  open,
  onClose,
  anchorRef,
}: {
  channelSpaceId: string;
  threadId: string;
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const destinations = useCopyDestinations();
  const copy = useCopyStudyPlan();

  const run = (destination: Destination) => {
    onClose();
    copy.mutate(
      { channelSpaceId, threadId, targetSpaceId: destination.id },
      {
        onSuccess: (result) => {
          if (result.alreadyCopied) {
            const where =
              destinations.find((d) => d.id === result.spaceId)?.title ??
              (result.spaceId ? 'another space' : 'My Home');
            toast.success(`You already have this study in ${where}`);
            return;
          }
          toast.success(`Added to ${destination.title}`);
        },
        onError: (err) => toastError(err, 'Could not copy this study'),
      },
    );
  };

  return (
    <PrototypeSidebarRowMenuPopover
      open={open}
      rowRef={anchorRef}
      triggerRootRef={anchorRef}
      minWidth={TRIGGER_ANCHOR_MIN_WIDTH}
      onDismiss={onClose}
      aria-label="Use this study in"
    >
      <div className="proto-menu-section" role="group" aria-label="Use this study in">
        {destinations.map((destination) => (
          <button
            key={destination.id ?? 'home'}
            type="button"
            role="menuitem"
            className="proto-menu-item"
            disabled={copy.isPending}
            onClick={(e) => {
              e.stopPropagation();
              run(destination);
            }}
          >
            <span className="proto-menu-item__icon" aria-hidden>
              {destination.id ? (
                <Icon name="user-group" size={PROTO_TOOLBAR_ICON_SIZE} />
              ) : (
                <ProtoHouseIcon size={PROTO_TOOLBAR_ICON_SIZE} />
              )}
            </span>
            <span className="proto-menu-item__label">{destination.title}</span>
          </button>
        ))}
      </div>
    </PrototypeSidebarRowMenuPopover>
  );
}

/**
 * The follower's action: they cannot write in the channel, so this is the one
 * thing the header offers them, and it takes the row the compose pair would.
 */
export default function PrototypeStudyPlanCopyButton({
  channelSpaceId,
  threadId,
}: {
  channelSpaceId: string;
  threadId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="proto-shared-thread-drilldown__actions proto-shared-thread-drilldown__actions--single" ref={rootRef}>
      <button
        type="button"
        className="proto-shared-thread-action"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        Use this study
      </button>
      <StudyPlanCopyMenu
        channelSpaceId={channelSpaceId}
        threadId={threadId}
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={rootRef}
      />
    </div>
  );
}
