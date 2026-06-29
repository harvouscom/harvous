import { createPortal } from 'react-dom';
import '../../../spa/src/styles/prototype-components.css';

export type ProtoStatusChipVariant = 'offline' | 'syncing' | 'success' | 'error';

const VARIANT_CLASS = {
  offline: 'proto-sync-chip--offline',
  syncing: 'proto-sync-chip--syncing',
  success: 'proto-sync-chip--success',
  error: 'proto-sync-chip--error',
} as const;

type ProtoStatusChipProps = {
  visible: boolean;
  variant: ProtoStatusChipVariant;
  label: string;
  showRetry?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
};

/** Fixed lower-left status pill (shared by offline sync and admin loading). */
export default function ProtoStatusChip({
  visible,
  variant,
  label,
  showRetry = false,
  onRetry,
  isRetrying = false,
}: ProtoStatusChipProps) {
  if (!visible || typeof document === 'undefined') return null;

  return createPortal(
    <div role="status" aria-live="polite" className={`proto-sync-chip ${VARIANT_CLASS[variant]}`}>
      <span
        aria-hidden="true"
        className={
          variant === 'syncing'
            ? 'proto-sync-chip__dot proto-sync-chip__dot--spin'
            : 'proto-sync-chip__dot'
        }
      />
      <span className="proto-sync-chip__label">{label}</span>
      {showRetry && onRetry ? (
        <button
          type="button"
          className="proto-sync-chip__retry"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying ? 'Retrying…' : 'Retry'}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
