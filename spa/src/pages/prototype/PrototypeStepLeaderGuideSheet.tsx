/**
 * A step's leader guide — notes and discussion questions for whoever leads the group through it
 * (docs/CHURCH_V2_ROADMAP.md §E). Leaders only: the drilldown opens this only for someone who can
 * manage the plan, and the server refuses everyone else.
 *
 * On a church channel's plan, staff write it once; groups that copy the plan get it with the
 * steps. On a group's copy, its leaders can change their own.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { useSaveStepGuide, type StepGuide } from '../../hooks/queries/useStudyPlanLeaderKit';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

const QUESTIONS_MAX = 12;

export default function PrototypeStepLeaderGuideSheet({
  open,
  threadId,
  step,
  guide,
  onOpenChange,
}: {
  open: boolean;
  threadId: string;
  step: { id: string; title: string } | null;
  guide: StepGuide | null;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveStepGuide(threadId);
  const [notes, setNotes] = useState('');
  const [questions, setQuestions] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNotes(guide?.leaderNotes ?? '');
    setQuestions(guide?.questions.length ? [...guide.questions] : ['']);
    setError(null);
  }, [open, step?.id, guide]);

  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const { asSheet } = useSheetPresentation();
  const showPopover = !asSheet && mounted;
  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    { enabled: showPopover, strategy: 'centered', topVhFraction: 0.12, fallbackWidth: 440, fallbackHeight: 480 },
    [step?.id, questions.length, error],
  );
  useDismissOnOutside(cardRef, () => onOpenChange(false), open && !asSheet && !save.isPending);

  if (!step) return null;

  const setQuestion = (index: number, value: string) =>
    setQuestions((list) => list.map((q, i) => (i === index ? value : q)));

  const submit = () => {
    setError(null);
    save.mutate(
      { noteId: step.id, leaderNotes: notes, questions: questions.map((q) => q.trim()).filter(Boolean) },
      {
        onSuccess: () => {
          window.toast?.success('Guide saved');
          onOpenChange(false);
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not save the guide'),
      },
    );
  };

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="compass" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">Leader guide · {step.title}</span>
        </div>
        <button type="button" className="proto-side-panel__action-btn" onClick={() => onOpenChange(false)} aria-label="Close" title="Close">
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-service-editor proto-step-guide">
        <p className="proto-caption proto-step-guide__who">Only leaders see this. Members see the step as it is.</p>

        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label" htmlFor="proto-step-guide-notes">
          <span>Notes for leading it</span>
          <span className="proto-service-editor__optional">optional</span>
        </label>
        <textarea
          id="proto-step-guide-notes"
          className="proto-settings-field__input proto-step-guide__notes"
          rows={4}
          maxLength={4000}
          value={notes}
          placeholder="What to emphasize, where people get stuck, how to open"
          onChange={(e) => setNotes(e.target.value)}
        />

        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
          <span>Discussion questions</span>
          <span className="proto-service-editor__optional">optional</span>
        </label>
        <ol className="proto-step-guide__questions">
          {questions.map((question, index) => (
            <li key={index} className="proto-step-guide__question">
              <input
                className="proto-settings-field__input"
                value={question}
                maxLength={300}
                placeholder={index === 0 ? 'What stood out to you in this passage?' : 'Another question'}
                aria-label={`Question ${index + 1}`}
                onChange={(e) => setQuestion(index, e.target.value)}
              />
              {questions.length > 1 ? (
                <button
                  type="button"
                  className="proto-side-panel__action-btn"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() => setQuestions((list) => list.filter((_, i) => i !== index))}
                >
                  <Icon name="xmark" size={11} />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        {questions.length < QUESTIONS_MAX ? (
          <button
            type="button"
            className="proto-church-review__text-btn proto-step-guide__add"
            onClick={() => setQuestions((list) => [...list, ''])}
          >
            Add a question
          </button>
        ) : null}

        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="proto-add-notes-sheet__footer">
        <button type="button" className="proto-share-popover__primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Saving…' : 'Save guide'}
        </button>
      </div>
    </>
  );

  if (showPopover && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop exiting={exiting} onDismiss={() => onOpenChange(false)} aria-label="Close leader guide" />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={`Leader guide for ${step.title}`}
          className={portaledDialogShellClassName('proto-connect-note-popover proto-step-guide-popover', exiting)}
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
