/**
 * A gathering's agenda — the leader's run of the evening (docs/CHURCH_V2_ROADMAP.md §E).
 *
 * Opened from the room's "Coming up" card, by its leaders only. Plain lines with optional minutes
 * and a running total. "Add discussion questions" copies in the questions the church (or the
 * group's leaders) wrote for the step the group is on — text someone wrote, never generated.
 * Nothing here is shown to members, and nothing records who came: no attendance, by design.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import {
  agendaItemsFromGuide,
  agendaTotalMinutes,
  useGatheringAgenda,
  useSaveGatheringAgenda,
  useStudyPlanLeaderKit,
  type AgendaItem,
} from '../../hooks/queries/useStudyPlanLeaderKit';
import { selectCurrentSpaceThread, useSpaceGroupThreads } from '../../hooks/queries/useSpaceGroupThreads';
import { useThreadNotes } from '../../hooks/queries/useThreadNotes';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

const ITEMS_MAX = 20;
const STARTER: AgendaItem[] = [
  { text: 'Welcome', minutes: 5 },
  { text: 'Read the passage', minutes: 10 },
  { text: 'Discuss', minutes: 30 },
  { text: 'Pray', minutes: 10 },
];

export default function PrototypeGatheringAgendaSheet({
  open,
  spaceId,
  gathering,
  onOpenChange,
}: {
  open: boolean;
  spaceId: string;
  gathering: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const agenda = useGatheringAgenda(spaceId, gathering?.id, { enabled: open });
  const save = useSaveGatheringAgenda(spaceId, gathering?.id);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The step the group is on: the pinned plan's current step.
  const threads = useSpaceGroupThreads(open ? spaceId : undefined);
  const plan = useMemo(() => {
    const pinned = selectCurrentSpaceThread(threads.data ?? []);
    return pinned && pinned.mode === 'sequence' ? pinned : null;
  }, [threads.data]);
  const planNotes = useThreadNotes(open && plan ? plan.id : undefined, spaceId);
  const firstPage = planNotes.data?.pages[0];
  const currentStepId = firstPage?.sequence?.currentNoteId ?? null;
  const currentStep = firstPage?.notes.find((note) => note.id === currentStepId) ?? null;
  const kit = useStudyPlanLeaderKit(plan?.id, { enabled: open && Boolean(plan) });
  const stepQuestions = currentStepId ? kit.data?.guides[currentStepId]?.questions ?? [] : [];
  const toAdd = agendaItemsFromGuide(items, stepQuestions);

  useEffect(() => {
    if (!open || !agenda.data) return;
    setItems(agenda.data.items.length ? agenda.data.items : STARTER);
    setError(null);
  }, [open, agenda.data]);

  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { asSheet } = useSheetPresentation();
  const showPopover = !asSheet && mounted;
  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    { enabled: showPopover, strategy: 'centered', topVhFraction: 0.1, fallbackWidth: 460, fallbackHeight: 520 },
    [gathering?.id, items.length, error],
  );
  useDismissOnOutside(cardRef, () => onOpenChange(false), open && !asSheet && !save.isPending);

  if (!gathering) return null;

  const update = (index: number, patch: Partial<AgendaItem>) =>
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, by: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const target = index + by;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const total = agendaTotalMinutes(items);

  const submit = () => {
    setError(null);
    save.mutate(
      {
        items: items.filter((item) => item.text.trim()),
        stepThreadId: plan && currentStepId ? plan.id : null,
        stepNoteId: plan && currentStepId ? currentStepId : null,
      },
      {
        onSuccess: () => {
          window.toast?.success('Agenda saved');
          onOpenChange(false);
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not save the agenda'),
      },
    );
  };

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="list-ol" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">Agenda · {gathering.title}</span>
        </div>
        <button type="button" className="proto-side-panel__action-btn" onClick={() => onOpenChange(false)} aria-label="Close" title="Close">
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-service-editor proto-agenda">
        <p className="proto-caption proto-step-guide__who">
          Only the group’s leaders see this.{total > 0 ? ` About ${total} minutes.` : ''}
        </p>

        {agenda.isPending ? (
          <p className="proto-caption">Loading…</p>
        ) : (
          <ol className="proto-agenda__items">
            {items.map((item, index) => (
              <li key={item.id ?? `new-${index}`} className="proto-agenda__item">
                <input
                  className="proto-settings-field__input proto-agenda__text"
                  value={item.text}
                  maxLength={200}
                  aria-label={`Agenda item ${index + 1}`}
                  onChange={(e) => update(index, { text: e.target.value })}
                />
                <input
                  className="proto-settings-field__input proto-agenda__minutes"
                  type="number"
                  min={0}
                  max={240}
                  inputMode="numeric"
                  value={item.minutes ?? ''}
                  placeholder="min"
                  aria-label={`Minutes for item ${index + 1}`}
                  onChange={(e) => update(index, { minutes: e.target.value === '' ? null : Math.max(0, Math.min(240, Math.trunc(Number(e.target.value)))) })}
                />
                <span className="proto-agenda__controls">
                  <button type="button" className="proto-side-panel__action-btn" aria-label={`Move item ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <Icon name="caret-up" size={10} />
                  </button>
                  <button type="button" className="proto-side-panel__action-btn" aria-label={`Move item ${index + 1} down`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                    <Icon name="caret-down" size={10} />
                  </button>
                  <button type="button" className="proto-side-panel__action-btn" aria-label={`Remove item ${index + 1}`} onClick={() => setItems((list) => list.filter((_, i) => i !== index))}>
                    <Icon name="xmark" size={10} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="proto-agenda__actions">
          {items.length < ITEMS_MAX ? (
            <button type="button" className="proto-church-review__text-btn proto-step-guide__add" onClick={() => setItems((list) => [...list, { text: '', minutes: null }])}>
              Add an item
            </button>
          ) : null}
          {toAdd.length > 0 && currentStep ? (
            <button
              type="button"
              className="proto-church-review__text-btn proto-step-guide__add"
              onClick={() => setItems((list) => [...list, ...toAdd].slice(0, ITEMS_MAX))}
            >
              Add discussion questions from “{currentStep.title || 'this step'}”
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="proto-add-notes-sheet__footer">
        <button type="button" className="proto-share-popover__primary" disabled={save.isPending || agenda.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save agenda'}
        </button>
      </div>
    </>
  );

  if (showPopover && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={() => onOpenChange(false)} aria-label="Close agenda" />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={`Agenda for ${gathering.title}`}
          className={portaledDialogShellClassName('proto-connect-note-popover proto-agenda-popover', exiting)}
          style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, zIndex: 6000 }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-folder-sheet">{content}</div>
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
