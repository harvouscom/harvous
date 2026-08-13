/**
 * About dialog for a shared space — join-page hero + letter + named member roster.
 */
import { useId, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoShell } from '../../layouts/proto-shell-context';
import type { SpaceDetail, SpaceMemberRow } from '../../hooks/queries/useSpace';
import { mapSpaceToAboutLetterSpace } from '../../lib/shared-space-about';
import PublicJoinSpaceHero from '../public/PublicJoinSpaceHero';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import SharedSpaceAboutLetter from './SharedSpaceAboutLetter';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

export interface SharedSpaceAboutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: SpaceDetail | null;
  members: SpaceMemberRow[];
  /** Ministry channels: hide follower roster for non-staff. */
  hideMemberRoster?: boolean;
  /** Ministry channel about card uses RSS on the color tile. */
  ministryChannel?: boolean;
}

export default function SharedSpaceAboutSheet({
  open,
  onOpenChange,
  space,
  members,
  hideMemberRoster = false,
  ministryChannel = false,
}: SharedSpaceAboutSheetProps) {
  const { userId: authUserId } = useAuth();
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.08,
      fallbackWidth: 360,
      fallbackHeight: 520,
    },
    [space?.id, members.length, colorScheme],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation, {
    dismissOnEscape: false,
  });
  useProtoDialogFocus({
    open: open && showPopoverPortal && space !== null,
    dialogRef: cardRef,
    onDismiss: () => onOpenChange(false),
  });

  if (!space) return null;

  const letterSpace = {
    ...mapSpaceToAboutLetterSpace(space, members),
    iconName: ministryChannel ? ('rss' as const) : ('user-group' as const),
  };
  const heroSpace = {
    color: space.color ?? undefined,
    backgroundGradient: space.backgroundGradient,
    cover: {
      light: space.coverBgLight ?? null,
      dark: space.coverBgDark ?? null,
    },
  };

  const selfMember = members.find((m) => m.userId === authUserId);
  const rosterMembers = hideMemberRoster
    ? []
    : members.length > 0
      ? members
      : selfMember
        ? [selfMember]
        : [];

  const content = (
    <>
      <h2 id={headingId} className="sr-only">
        About {space.title}
      </h2>
      <div className="proto-shared-space-about__scroll">
        <div className="proto-shared-space-about__hero">
          <PublicJoinSpaceHero space={heroSpace} />
          <button
            type="button"
            className="proto-side-panel__action-btn proto-shared-space-about__close"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            title="Close"
            data-proto-dialog-initial-focus
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>
        <SharedSpaceAboutLetter
          space={letterSpace}
          members={rosterMembers}
          meetingDay={space?.meetingDay ?? null}
          meetingTime={space?.meetingTime ?? null}
          meetingKind={space?.meetingKind ?? null}
          meetingUrl={space?.meetingUrl ?? null}
        />
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={() => onOpenChange(false)} aria-label="Close about dialog" />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={portaledDialogShellClassName('proto-shared-space-about', exiting)}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          {content}
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-shared-space-about proto-shared-space-about--sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
