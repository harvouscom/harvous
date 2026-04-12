import React, { useEffect, useState } from 'react';
import SquareButton from './SquareButton';
import DefaultTranslationPanel from './DefaultTranslationPanel';
import MyChurchPanel from './MyChurchPanel';
import LockPinPanel from './LockPinPanel';
import { getKeyboardShortcutsReference } from '@/utils/keyboard-shortcuts';
import { isMobileDevice } from '@/utils/pwa-prompt';

type PreferenceView = 'list' | 'bibleTranslation' | 'myChurch' | 'lockPin' | 'keyboardShortcuts';

interface MyPreferencesPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function MyPreferencesPanel({ onClose, inBottomSheet = false }: MyPreferencesPanelProps) {
  const [view, setView] = useState<PreferenceView>('list');
  const hideKeyboardShortcuts = isMobileDevice();

  useEffect(() => {
    if (hideKeyboardShortcuts && view === 'keyboardShortcuts') {
      setView('list');
    }
  }, [hideKeyboardShortcuts, view]);

  if (view === 'bibleTranslation') {
    return (
      <DefaultTranslationPanel
        onClose={() => setView('list')}
        inBottomSheet={inBottomSheet}
        backIconDirection="left"
      />
    );
  }

  if (view === 'myChurch') {
    return (
      <MyChurchPanel
        onClose={() => setView('list')}
        inBottomSheet={inBottomSheet}
        backIconDirection="left"
      />
    );
  }

  if (view === 'lockPin') {
    return (
      <LockPinPanel
        onClose={() => setView('list')}
        inBottomSheet={inBottomSheet}
        backIconDirection="left"
      />
    );
  }

  if (view === 'keyboardShortcuts' && !hideKeyboardShortcuts) {
    const shortcutGroups = getKeyboardShortcutsReference();
    return (
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`}>
        <div className="flex-fill flex-stack" style={{ gap: 0 }}>
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            <div className="panel__header">
              <div className="panel__title">
                <p>Keyboard shortcuts</p>
              </div>
            </div>

            <div
              className={`panel__body panel__body--keyboard-shortcuts ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}
            >
              <div
                className={`panel__content keyboard-shortcuts-panel ${inBottomSheet ? 'panel__content--bottom-sheet' : ''} flex-1 min-h-0`}
              >
                <div className="panel__content-scroll">
                <div className="keyboard-shortcuts-panel__groups">
                  {shortcutGroups.map((group, groupIndex) => (
                    <React.Fragment key={group.heading}>
                      {groupIndex > 0 ? <div className="panel__divider" aria-hidden="true" /> : null}
                      <p className="organized-content__section-header">{group.heading}</p>
                      <ul className="keyboard-shortcuts-panel__list">
                        {group.items.map((row) => (
                          <li key={row.action} className="keyboard-shortcuts-panel__item">
                            <div className="keyboard-shortcuts-panel__item-main">
                              <span className="keyboard-shortcuts-panel__action">{row.action}</span>
                              <span
                                className="keyboard-shortcuts-panel__chord"
                                aria-label={row.keyParts.join(' + ')}
                              >
                                {row.keyParts.map((part, i) => (
                                  <React.Fragment key={`${row.action}-${i}-${part}`}>
                                    {i > 0 ? (
                                      <span className="keyboard-shortcuts-panel__chord-sep">+</span>
                                    ) : null}
                                    <kbd>{part}</kbd>
                                  </React.Fragment>
                                ))}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </React.Fragment>
                  ))}
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel__footer--buttons">
          <SquareButton
            variant="Back"
            onClick={() => setView('list')}
            inBottomSheet={inBottomSheet}
          />
        </div>
      </div>
    );
  }

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  const renderOption = (label: string, onClick: () => void) => (
    <div
      onClick={onClick}
      className="w-full cursor-pointer"
    >
      <div
        className="space-button relative rounded-3xl h-[64px] transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
        style={{ backgroundImage: 'var(--color-gradient-gray)' }}
      >
        <div className="flex-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
          <div className="flex-fill overflow-hidden">
            <span
              className="panel__list-item-label"
              style={{ color: 'var(--color-deep-grey)' }}
            >
              {label}
            </span>
          </div>
          <div className="flex-center relative shrink-0">
            <div className="panel__list-item-icon-wrapper">
              <div className="flex-center relative shrink-0">
                <div className="relative w-6 h-6">
                  <svg
                    className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125"
                    viewBox="0 0 320 512"
                  >
                    <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`}>
      <div className="flex-fill flex-stack" style={{ gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>My Preferences</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              <div className="panel__content-scroll">
              <div className="flex flex-col gap-2 w-full">
                {renderOption('Preferred Bible', () => setView('bibleTranslation'))}
                {renderOption('My Church', () => setView('myChurch'))}
                {renderOption('Lock PIN', () => setView('lockPin'))}
                {!hideKeyboardShortcuts &&
                  renderOption('Keyboard shortcuts', () => setView('keyboardShortcuts'))}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
      </div>
    </div>
  );
}
