import { createPortal } from 'react-dom';
import { useSyncQueueStatus } from '../hooks/useSyncQueueStatus';

/**
 * Single global sync-status pill for the prototype shell. Shows offline / pending / syncing /
 * all-synced / failed states from the offline mutation queue. Mounted once inside
 * SimplifiedPrototypeLayout (the prototype-only boundary) so it never doubles up with the
 * Classic OfflineIndicator. Fixed lower-left so it clears the bottom-right/center toaster.
 */
type ChipVariant = 'offline' | 'pending' | 'syncing' | 'success' | 'error';

const VARIANT_STYLE: Record<ChipVariant, { bg: string; fg: string; dot: string }> = {
  offline: { bg: 'var(--pds-surface-elevated, #fff)', fg: 'var(--pds-text-secondary, #555)', dot: '#9aa0a6' },
  pending: { bg: 'var(--pds-surface-elevated, #fff)', fg: 'var(--pds-text-secondary, #555)', dot: '#e8a33d' },
  syncing: { bg: 'var(--pds-surface-elevated, #fff)', fg: 'var(--pds-text-secondary, #555)', dot: '#3d7de8' },
  success: { bg: 'var(--pds-surface-elevated, #fff)', fg: 'var(--pds-text-secondary, #555)', dot: '#2ea169' },
  error: { bg: 'var(--pds-surface-elevated, #fff)', fg: 'var(--pds-destructive, #c0392b)', dot: '#c0392b' },
};

export default function PrototypeSyncChip({ userId }: { userId?: string | null }) {
  const { isOffline, pendingCount, failedCount, syncError, isSyncing, showAllSynced, retry } =
    useSyncQueueStatus(userId);

  const visible =
    isOffline || pendingCount > 0 || failedCount > 0 || !!syncError || showAllSynced;
  if (!visible || typeof document === 'undefined') return null;

  let variant: ChipVariant;
  let label: string;
  let showRetry = false;

  if (failedCount > 0 || syncError) {
    variant = 'error';
    label =
      failedCount > 0
        ? `${failedCount} change${failedCount === 1 ? '' : 's'} didn't sync`
        : "Changes didn't sync";
    showRetry = !isOffline;
  } else if (showAllSynced) {
    variant = 'success';
    label = 'All changes synced';
  } else if (isOffline) {
    variant = 'offline';
    label = pendingCount > 0 ? `Offline · ${pendingCount} pending` : 'Offline';
  } else if (isSyncing) {
    variant = 'syncing';
    label = pendingCount > 0 ? `Syncing ${pendingCount}…` : 'Syncing…';
  } else {
    variant = 'pending';
    label = `${pendingCount} pending`;
  }

  const v = VARIANT_STYLE[variant];

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="proto-sync-chip"
      style={{
        position: 'fixed',
        left: 'max(16px, env(safe-area-inset-left))',
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        zIndex: 1000020,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 14px',
        borderRadius: 999,
        background: v.bg,
        color: v.fg,
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.12)',
        border: '1px solid var(--pds-separator, rgba(0,0,0,0.08))',
        pointerEvents: 'auto',
      }}
    >
      <span
        aria-hidden="true"
        className={variant === 'syncing' ? 'proto-sync-chip__dot proto-sync-chip__dot--spin' : 'proto-sync-chip__dot'}
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: variant === 'syncing' ? 'transparent' : v.dot,
          border: variant === 'syncing' ? `2px solid ${v.dot}` : 'none',
          borderTopColor: variant === 'syncing' ? 'transparent' : undefined,
          boxSizing: 'border-box',
          flex: '0 0 auto',
        }}
      />
      <span>{label}</span>
      {showRetry ? (
        <button
          type="button"
          onClick={retry}
          style={{
            marginLeft: 4,
            border: 'none',
            background: 'transparent',
            color: 'var(--pds-accent, #3d7de8)',
            font: 'inherit',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Retry
        </button>
      ) : null}
      <style>{`
        @keyframes protoSyncChipSpin { to { transform: rotate(360deg); } }
        .proto-sync-chip__dot--spin { animation: protoSyncChipSpin 0.8s linear infinite; }
      `}</style>
    </div>,
    document.body,
  );
}
