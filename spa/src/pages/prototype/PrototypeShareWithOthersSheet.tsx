/**
 * Share a template, a note or a Thread of yours with everyone.
 *
 * Deliberately small: the thing is already made, so the only thing left to decide
 * is the one line that helps someone else recognise it. Category is not asked for
 * — the reviewer files it, and asking a person to pick from a taxonomy they cannot
 * see while they are giving something away is asking them to do a curator's job
 * for the privilege.
 *
 * The listing is attributed. The copy says so before the button rather than
 * leaving it to be discovered: someone should know their name goes with it
 * before they press it, not after.
 *
 * What you have already shared is not listed here. The sheet is for sending one
 * thing; the history is a list of every kind of sharing, and it lives in
 * Settings › Sharing, which the sent state points to.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { prototypeHref } from '@/lib/prototype-path';
import { APIError } from '../../lib/api';
import { useSubmitToDiscover } from '../../hooks/mutations/useDiscoverMutations';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

/** Same cap the create endpoint enforces, so the field cannot write a rejection. */
const DESCRIPTION_MAX_LENGTH = 90;

export type ShareWithOthersKind = 'template' | 'note' | 'pack';

export interface ShareWithOthersTarget {
  kind: ShareWithOthersKind;
  id: string;
  name: string;
  description?: string | null;
}

/** What the read-only field above the description is labelled. */
const KIND_LABEL: Record<ShareWithOthersKind, string> = {
  template: 'Template',
  note: 'Note',
  pack: 'Thread',
};

const KIND_SENT_COPY: Record<ShareWithOthersKind, string> = {
  template:
    'Sent. If it is a good fit, it turns up in Discover for everyone — and your copy stays exactly where it is.',
  note: 'Sent. If it is a good fit, people can take their own copy — yours stays exactly as it is.',
  pack: 'Sent. If it is a good fit, people can take the whole Thread — yours stays exactly as it is.',
};

const KIND_DESCRIPTION_PLACEHOLDER: Record<ShareWithOthersKind, string> = {
  template: 'One line, so someone knows if it suits them',
  note: 'One line, so someone knows what this is about',
  pack: 'One line, so someone knows what this Thread covers',
};

export default function PrototypeShareWithOthersSheet({
  open,
  target,
  onOpenChange,
}: {
  open: boolean;
  target: ShareWithOthersTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const submitToDiscover = useSubmitToDiscover();
  const navigate = useNavigate();

  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  /* Seeded from the template's own blurb, because the common case is that it
     already says the right thing and the person should not have to retype it. */
  useEffect(() => {
    if (open && target) {
      setDescription((target.description ?? '').slice(0, DESCRIPTION_MAX_LENGTH));
      setError(null);
      setSent(false);
    }
  }, [open, target]);

  const { asSheet: shouldUseSheetPresentation } = useSheetPresentation();
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.16,
      fallbackWidth: 380,
      fallbackHeight: 340,
    },
    [sent, error],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation);

  const close = () => {
    onOpenChange(false);
    /* Reset after the exit animation, so the form does not visibly empty itself
       on the way out. */
    window.setTimeout(() => {
      setDescription('');
      setError(null);
      setSent(false);
    }, 250);
  };

  /* Out to the page that lists every kind of sharing, closing this sheet on the way. Same route
     cast the Settings layout uses — the generated route union does not know the prototype base. */
  const openSharingSettings = () => {
    close();
    void navigate({ to: prototypeHref('settings/sharing') as '/' });
  };

  const submit = () => {
    if (!target || submitToDiscover.isPending) return;
    setError(null);
    submitToDiscover.mutate(
      { kind: target.kind, sourceId: target.id, description: description.trim() || null },
      {
        onSuccess: () => setSent(true),
        onError: (err) =>
          setError(
            err instanceof APIError
              ? err.message
              : err instanceof Error
                ? err.message
                : `Could not share this ${KIND_LABEL[target.kind].toLowerCase()}.`,
          ),
      },
    );
  };

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">
            {sent ? 'Sent' : 'Share with others'}
          </span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={close}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-service-editor">
        {sent ? (
          <>
            <p className="proto-caption proto-service-editor__starter-hint">
              {KIND_SENT_COPY[target?.kind ?? 'template']}
            </p>
            <p className="proto-caption proto-service-editor__starter-hint">
              Everything you have shared is in{' '}
              <button
                type="button"
                className="proto-share-others__settings-link"
                onClick={openSharingSettings}
              >
                Settings › Sharing
              </button>
              , where you can take it back.
            </p>
          </>
        ) : (
          <>
            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-share-others-name"
            >
              {KIND_LABEL[target?.kind ?? 'template']}
            </label>
            <input
              id="proto-share-others-name"
              type="text"
              className="proto-create-folder-sheet__name-input"
              value={target?.name ?? ''}
              readOnly
            />

            <label
              className="proto-inspector-section-title proto-create-folder-sheet__field-label"
              htmlFor="proto-share-others-desc"
            >
              <span>What it is for</span>
              <span className="proto-service-editor__optional">optional</span>
            </label>
            <input
              id="proto-share-others-desc"
              type="text"
              className="proto-create-folder-sheet__name-input"
              value={description}
              placeholder={KIND_DESCRIPTION_PLACEHOLDER[target?.kind ?? 'template']}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
            />

            {/* Said before the button, not after. */}
            <p className="proto-caption proto-service-editor__starter-hint">
              Sent with your name on it, and looked over before anyone sees it. Nothing here
              is ever sold, and you can take it back at any time.
            </p>
          </>
        )}
      </div>

      {error ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
        {sent ? (
          <button type="button" className="proto-share-popover__primary" onClick={close}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="proto-share-popover__primary"
            disabled={!target || submitToDiscover.isPending}
            onClick={submit}
          >
            {submitToDiscover.isPending ? 'Sending…' : 'Share with others'}
          </button>
        )}
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={close}
          aria-label="Close share form"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label="Share with others"
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
        onOverlayClick={close}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-create-folder-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}
