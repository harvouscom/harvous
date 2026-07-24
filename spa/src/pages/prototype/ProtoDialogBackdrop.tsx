/**
 * Full-viewport scrim for desktop portaled sheet dialogs (popover presentation).
 * Mobile coarse-pointer flows use Vaul DrawerContent overlays instead.
 *
 * Enter/exit timing: PROTO_VOTD_SHEET_MOTION_MS + `.proto-dialog-backdrop--motion` in prototype-components.css.
 */
export default function ProtoDialogBackdrop({
  onDismiss,
  exiting = false,
  'aria-label': ariaLabel = 'Close dialog',
}: {
  onDismiss: () => void;
  exiting?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      className={portaledDialogBackdropClassName(exiting)}
      aria-label={ariaLabel}
      onClick={onDismiss}
    />
  );
}

export function portaledDialogBackdropClassName(exiting: boolean): string {
  return [
    'proto-dialog-backdrop',
    'proto-dialog-backdrop--motion',
    exiting ? 'proto-dialog-backdrop--exiting' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function portaledDialogShellClassName(base: string, exiting: boolean): string {
  return [base, 'proto-portaled-dialog--motion', exiting ? 'proto-portaled-dialog--exiting' : '']
    .filter(Boolean)
    .join(' ');
}
