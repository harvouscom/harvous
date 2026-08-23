/**
 * Invite a staff member — a sheet, not a permanent form in the Team pane.
 *
 * Inviting is occasional; the roster is what you came to see. Three stacked
 * fields plus a primary button sat under the list at all times and pushed it
 * down, so the pane read as a form with a list attached rather than a team.
 */
import { useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { ASSIGNABLE_CHURCH_ROLES } from '../../lib/church-roles';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

export interface PrototypeChurchInviteSheetProps {
  open: boolean;
  email: string;
  role: string;
  pending: boolean;
  error: string | null;
  /** Seats remaining; the form is closed off entirely when the team is full. */
  seatsLeft: number;
  onEmailChange: (email: string) => void;
  onRoleChange: (role: string) => void;
  onSubmit: () => void;
  onOpenChange: (open: boolean) => void;
}

export default function PrototypeChurchInviteSheet({
  open,
  email,
  role,
  pending,
  error,
  seatsLeft,
  onEmailChange,
  onRoleChange,
  onSubmit,
  onOpenChange,
}: PrototypeChurchInviteSheetProps) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const { asSheet: shouldUseSheetPresentation } = useSheetPresentation();
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.18,
      fallbackWidth: 360,
      fallbackHeight: 320,
    },
    [error, seatsLeft],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation && !pending);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || pending) return;
    onSubmit();
  };

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span className="proto-study-thread-popover__title">Invite to team</span>
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

      <form onSubmit={submit} className="proto-service-editor proto-church-invite">
        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-church-invite-email"
        >
          Email
        </label>
        <input
          id="proto-church-invite-email"
          className="proto-create-folder-sheet__name-input"
          type="email"
          value={email}
          placeholder="name@church.org"
          disabled={pending}
          onChange={(e) => onEmailChange(e.target.value)}
        />

        <label
          className="proto-inspector-section-title proto-create-folder-sheet__field-label"
          htmlFor="proto-church-invite-role"
        >
          Role
        </label>
        {/* The list, not a dropdown: a role is a set of powers, and picking
            one blind from a collapsed menu is how someone gets handed billing
            by accident. Same control as the member sheet's role picker. */}
        <div className="proto-church-member__roles" role="radiogroup" aria-label="Role">
          {ASSIGNABLE_CHURCH_ROLES.map((option) => {
            const selected = option.role === role;
            return (
              <button
                key={option.role}
                type="button"
                role="radio"
                aria-checked={selected}
                className="proto-church-member__role-option"
                disabled={pending}
                onClick={() => onRoleChange(option.role)}
              >
                <span className="proto-church-member__role-icon" aria-hidden>
                  <Icon name={option.icon} size={13} />
                </span>
                <span className="proto-church-member__role-text">
                  <span className="pds-list-title proto-church-member__role-name">
                    {option.label}
                  </span>
                  <span className="proto-caption proto-church-member__role-desc">
                    {option.description}
                  </span>
                </span>
                {selected ? <Icon name="check" size={11} aria-hidden /> : null}
              </button>
            );
          })}
        </div>

        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="proto-share-popover__primary proto-church-invite__submit"
          disabled={pending || !email.trim()}
        >
          {pending ? 'Inviting…' : 'Send invite'}
        </button>
      </form>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close invite"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label="Invite to team"
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-church-invite-popover',
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
