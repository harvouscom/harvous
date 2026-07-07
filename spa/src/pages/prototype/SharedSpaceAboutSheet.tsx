/**
 * About dialog for a shared space — join-page hero + letter + named member roster.
 */
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import type { SpaceDetail, SpaceMemberRow } from '../../hooks/queries/useSpace';
import { mapSpaceToAboutLetterSpace } from '../../lib/shared-space-about';
import PublicJoinSpaceHero from '../public/PublicJoinSpaceHero';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import SharedSpaceAboutLetter from './SharedSpaceAboutLetter';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';

export interface SharedSpaceAboutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  space: SpaceDetail | null;
  members: SpaceMemberRow[];
}

export default function SharedSpaceAboutSheet({
  open,
  onOpenChange,
  space,
  members,
}: SharedSpaceAboutSheetProps) {
  const { userId: authUserId } = useAuth();
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  useLayoutEffect(() => {
    if (!showPopoverPortal) return;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 520;
    const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 360;
    const viewportMargin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      left: Math.max(viewportMargin, (vw - cardWidth) / 2),
      top: Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * 0.08)),
    });
  }, [showPopoverPortal, space?.id, members.length, colorScheme]);

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  if (!space) return null;

  const letterSpace = mapSpaceToAboutLetterSpace(space, members);
  const heroSpace = {
    color: space.color ?? undefined,
    backgroundGradient: space.backgroundGradient,
    cover: {
      light: space.coverBgLight ?? null,
      dark: space.coverBgDark ?? null,
    },
  };

  const selfMember = members.find((m) => m.userId === authUserId);
  const rosterMembers =
    members.length > 0
      ? members
      : selfMember
        ? [selfMember]
        : [];

  const content = (
    <div className="proto-shared-space-about__scroll">
      <div className="proto-shared-space-about__hero">
        <PublicJoinSpaceHero space={heroSpace} />
        <button
          type="button"
          className="proto-side-panel__action-btn proto-shared-space-about__close"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>
      <SharedSpaceAboutLetter space={letterSpace} members={rosterMembers} />
    </div>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close about dialog"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={`About ${space.title}`}
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
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
