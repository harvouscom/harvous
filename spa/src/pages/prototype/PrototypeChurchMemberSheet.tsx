/**
 * One staff member, opened from the Team roster.
 *
 * The roster rows used to be inert divs wearing `proto-church-tools__row` — the
 * same class the navigable Teaching plan and Team rows use — so they looked
 * tappable and did nothing, and Remove sat inline as a pill on every row but
 * your own. This gives every row somewhere to go and moves the destructive act
 * off the list, where a mis-tap is cheapest to make.
 *
 * The role picker is the point: a role is what grants the teaching plan and
 * church templates, and before this a church admin had to open the Clerk
 * dashboard to hand that out. Two rows are deliberately absent — your own
 * (demoting yourself mid-request strands the church) and the last admin's
 * (a church with no admin can't get back into its own roster).
 */
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import type { ChurchStaffMember } from '../../hooks/queries/useChurchStaff';
import { ASSIGNABLE_CHURCH_ROLES, churchRoleIcon } from '../../lib/church-roles';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';

export interface PrototypeChurchMemberSheetProps {
  open: boolean;
  member: ChurchStaffMember | null;
  /** Human role label, resolved by the roster so both surfaces agree. */
  roleLabel: string;
  /** Server's `manage_staff` verdict — a leader can publish, not staff up. */
  canManage: boolean;
  /** False when this is the church's only admin; demoting them locks it out. */
  canChangeRole: boolean;
  onSetRole: (member: ChurchStaffMember, role: string) => void;
  pending: boolean;
  error: string | null;
  onRemove: (member: ChurchStaffMember) => void;
  onOpenChange: (open: boolean) => void;
}

export default function PrototypeChurchMemberSheet({
  open,
  member,
  roleLabel,
  canManage,
  canChangeRole,
  onSetRole,
  pending,
  error,
  onRemove,
  onOpenChange,
}: PrototypeChurchMemberSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);

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
      topVhFraction: 0.18,
      fallbackWidth: 360,
      fallbackHeight: 260,
    },
    [member?.userId, error],
  );

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation && !pending);

  if (!member) return null;

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name={churchRoleIcon(member.role)} size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">
            {member.displayName}
            {member.isSelf ? ' (you)' : ''}
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

      <div className="proto-service-editor">
        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label">
          Role
        </label>

        {canManage && canChangeRole ? (
          <div className="proto-church-member__roles" role="radiogroup" aria-label="Role">
            {ASSIGNABLE_CHURCH_ROLES.map((option) => {
              const selected = option.role === member.role;
              return (
                <button
                  key={option.role}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="proto-church-member__role-option"
                  disabled={pending}
                  onClick={() => {
                    if (!selected) onSetRole(member, option.role);
                  }}
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
        ) : (
          <>
            <p className="proto-caption proto-church-member__role">{roleLabel}</p>
            {/* Say why it's fixed rather than showing a picker that would fail. */}
            <p className="proto-caption proto-church-member__note">
              {member.isSelf
                ? 'You can’t change your own role. Another admin can.'
                : !canChangeRole
                  ? 'Your church needs at least one admin, so this one can’t change yet.'
                  : 'Only a church admin can change roles.'}
            </p>
          </>
        )}

        {error ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {canManage && !member.isSelf ? (
        <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
          <button
            type="button"
            className="proto-sheet-quiet-action proto-sheet-quiet-action--danger"
            disabled={pending}
            onClick={() => onRemove(member)}
          >
            {pending ? 'Removing…' : 'Remove from team'}
          </button>
        </div>
      ) : null}
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close team member"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-label={member.displayName}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-church-member-popover',
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
