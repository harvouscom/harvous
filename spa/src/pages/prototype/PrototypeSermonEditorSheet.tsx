/**
 * Add or edit one sermon on the church's teaching plan — the compact sidebar's
 * presentation of `PrototypeSermonEditorFields`.
 *
 * One sermon per open — deliberately no bulk "create a whole series" flow.
 * Entering a quarter is a once-a-quarter job, and a bulk creator would need its
 * own endpoint, its own partial-failure story, and a second set of validation
 * rules for rows that exist but have nothing in them yet.
 *
 * All the form logic lives in the fields component; what remains here is the
 * choice between a centred popover and a mobile drawer, and the header the
 * expanded planner's pane supplies for itself.
 *
 * The date can't be cleared from here: `allowNullDate` stays off, because the
 * backlog is a board idea and a sheet that can quietly empty its date field is
 * a worse default than one that cannot.
 */
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import type {
  ChurchServiceTimeOption,
  TeachingPlanSeries,
  TeachingPlanSermon,
} from '../../hooks/queries/useChurchTeachingPlan';
import { planVocabulary } from '../../lib/church-services';
import PrototypeSermonEditorFields from './PrototypeSermonEditorFields';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

export interface PrototypeSermonEditorSheetProps {
  open: boolean;
  orgId: string | null;
  /** Null = creating a new service. */
  service: TeachingPlanSermon | null;
  /** This plan's series, most recently taught first. Never the other plan's. */
  series: TeachingPlanSeries[];
  /** The church's recurring services — which ones this sermon fills. */
  serviceTimes?: ChurchServiceTimeOption[];
  /**
   * Which plan is being edited: null = the church's, a space id = that
   * ministry's. It picks the write path, so an editor opened from a space plan
   * can never post into the church's — the failure this prop exists to prevent.
   */
  planSpaceId?: string | null;
  /**
   * What this plan holds, server-decided. A channel plans content; everything
   * else gathers. It picks the sheet's whole vocabulary and hides the
   * gathering-only fields — without it, tapping "Add content" on a channel
   * opened a window headed "Add a sermon".
   */
  planKind?: 'gathering' | 'content';
  /** Server's `manage_templates` verdict — gates the empty-state nudge only. */
  canManageChurchTemplates?: boolean;
  /** Opens the Church starters pane; the sheet closes itself first. */
  onOpenStarters?: () => void;
  onOpenChange: (open: boolean) => void;
}

export default function PrototypeSermonEditorSheet({
  open,
  orgId,
  service,
  series,
  serviceTimes = [],
  planSpaceId = null,
  planKind,
  canManageChurchTemplates = false,
  onOpenStarters,
  onOpenChange,
}: PrototypeSermonEditorSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isEditing = Boolean(service);
  /* The same source the button that opened this sheet reads, so the two can
     never disagree again — `planSpaceId` already tells us which plan we're on. */
  const vocab = planVocabulary({ onSpacePlan: planSpaceId !== null, planKind });

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  /*
    The fields used to live here, and the position hook re-measured on their
    `serviceDate` and `title`. Those are the fields' own state now, so the form
    reports height changes instead — the calendar opening still re-centres the
    popover, which is what those deps were really standing in for.
  */
  const [layoutVersion, setLayoutVersion] = useState(0);
  const onLayoutChange = useCallback(() => setLayoutVersion((v) => v + 1), []);

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.1,
      fallbackWidth: 380,
      fallbackHeight: 560,
    },
    [layoutVersion],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="calendar-check" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">
            {isEditing ? `Edit ${vocab.itemNoun}` : vocab.addLabel}
          </span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <PrototypeSermonEditorFields
        orgId={orgId}
        service={service}
        series={series}
        serviceTimes={serviceTimes}
        planSpaceId={planSpaceId}
        planKind={planKind}
        canManageChurchTemplates={canManageChurchTemplates}
        onOpenStarters={onOpenStarters}
        active={open}
        onDone={() => onOpenChange(false)}
        onLayoutChange={onLayoutChange}
      />
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close sermon editor"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={isEditing ? 'Edit sermon' : 'Add a sermon'}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-service-editor-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">
            {content}
          </div>
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
        className="proto-connect-note-sheet proto-create-folder-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
