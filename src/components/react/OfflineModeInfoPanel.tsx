import React, { useId } from 'react';
import { formatBadgeCount } from '@/utils/badge-count';
import Icon from './Icon';
import SquareButton from './SquareButton';

export interface OfflineModeInfoPanelProps {
  pendingSyncCount: number;
  onClose: () => void;
  /** True when shown inside mobile bottom sheet (Vaul drawer). */
  inBottomSheet: boolean;
}

const BULLETS = [
  'You can create new notes and keep editing them while offline.',
  'Most navigation and other actions are paused until you are back online.',
  "When you reconnect, Harvous syncs queued changes automatically.",
] as const;

/**
 * Offline help UI — same structure as Get Support / My Data (panel + footer row).
 * Used in the mobile drawer and in the desktop additional column.
 */
export default function OfflineModeInfoPanel({ pendingSyncCount, onClose, inBottomSheet }: OfflineModeInfoPanelProps) {
  const titleId = useId();
  const syncStatusId = useId();

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className={inBottomSheet ? 'flex-fill flex-stack' : 'flex-stack'} style={{ gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header offline-help-panel__header">
            <div className="panel__title offline-help-panel__title">
              <p id={titleId}>Currently offline</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div
              className={`panel__content offline-help-panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}
            >
              <ul className="offline-help-dialog__list">
                {BULLETS.map((text) => (
                  <li key={text} className="offline-help-dialog__bullet">
                    <span className="offline-help-dialog__bullet-icon" aria-hidden>
                      <Icon name="check" size={14} />
                    </span>
                    <span className="offline-help-dialog__bullet-text">{text}</span>
                  </li>
                ))}
              </ul>

              <div
                id={syncStatusId}
                className="offline-help-panel__sync-card"
                role="status"
                aria-live="polite"
              >
                <p className="offline-help-panel__sync-eyebrow">Sync status</p>
                {pendingSyncCount > 0 ? (
                  <>
                    <div className="offline-help-panel__sync-title-row">
                      <span className="offline-help-panel__sync-icon" aria-hidden>
                        <Icon name="cloud-arrow-up" size={20} />
                      </span>
                      <p className="offline-help-panel__sync-title">
                        <strong>{formatBadgeCount(pendingSyncCount)}</strong>
                        {pendingSyncCount === 1 ? ' change is' : ' changes are'} queued to sync on this device.
                      </p>
                    </div>
                    <p className="offline-help-panel__sync-detail">
                      They will upload automatically when you are back online.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="offline-help-panel__sync-title-row">
                      <span className="offline-help-panel__sync-icon" aria-hidden>
                        <Icon name="check" size={16} />
                      </span>
                      <p className="offline-help-panel__sync-title">All caught up</p>
                    </div>
                    <p className="offline-help-panel__sync-detail">
                      Nothing is waiting to sync on this device.
                    </p>
                  </>
                )}
              </div>

              <button
                type="button"
                className="offline-help-panel__refresh space-button relative h-[64px] w-full cursor-pointer rounded-3xl transition-[scale,shadow] duration-300 flex-center"
                style={{
                  backgroundImage: 'var(--color-gradient-gray)',
                  marginBottom: inBottomSheet ? '0.75rem' : undefined,
                }}
                onClick={handleRefresh}
              >
                <span
                  className="inline-flex items-center gap-2 font-sans text-[18px] font-semibold"
                  style={{ color: 'var(--color-deep-grey)' }}
                >
                  <Icon name="arrows-rotate" size={20} />
                  Refresh page
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={onClose} inBottomSheet={inBottomSheet} />
        </div>
      </div>
    </div>
  );
}
