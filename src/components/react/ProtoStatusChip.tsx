import { createPortal } from 'react-dom';
import '../../../spa/src/styles/prototype-components.css';

/*
 * Only loading is left. Offline, saved and failed belonged to the prototype's sync pill, which
 * moved into the toolbar (`PrototypeSyncStatusButton`) — so this is the admin pages' "Loading…"
 * and nothing else, and the variant stays only so call sites read as what they are.
 */
export type ProtoStatusChipVariant = 'syncing';

type ProtoStatusChipProps = {
  visible: boolean;
  variant: ProtoStatusChipVariant;
  label: string;
};

/** Fixed lower-left loading pill for the admin pages. */
export default function ProtoStatusChip({ visible, label }: ProtoStatusChipProps) {
  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div role="status" aria-live="polite" className="proto-sync-chip">
      <span aria-hidden="true" className="proto-sync-chip__dot" />
      <span className="proto-sync-chip__label">{label}</span>
    </div>,
    document.body,
  );
}
