import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import SquareButton from './SquareButton';
import { TRANSLATIONS, TRANSLATION_ORDER } from '@/data/translations';
import { getCachedProfileData, updateCachedProfileData } from '@/utils/profile-cache';

interface DefaultTranslationPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
  backIconDirection?: "auto" | "left" | "down";
}

export default function DefaultTranslationPanel({
  onClose,
  inBottomSheet = false,
  backIconDirection = "auto",
}: DefaultTranslationPanelProps) {
  const queryClient = useQueryClient();
  const [selectedTranslation, setSelectedTranslation] = useState<string>('NET');
  const [originalTranslation, setOriginalTranslation] = useState<string>('NET');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load current default translation from cache or API
  useEffect(() => {
    const cached = getCachedProfileData();
    if (cached?.defaultTranslation) {
      setSelectedTranslation(cached.defaultTranslation);
      setOriginalTranslation(cached.defaultTranslation);
    } else {
      // Fetch from API as fallback
      loadTranslation();
    }
  }, []);

  const loadTranslation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/user/get-profile', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const translation = data.defaultTranslation || 'NET';
        setSelectedTranslation(translation);
        setOriginalTranslation(translation);
      }
    } catch (error) {
      console.error('DefaultTranslationPanel: Error loading translation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = selectedTranslation !== originalTranslation;

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/user/update-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ defaultTranslation: selectedTranslation }),
      });

      const data = await response.json();

      if (response.ok) {
        setOriginalTranslation(selectedTranslation);

        // Update profile cache
        updateCachedProfileData({ defaultTranslation: selectedTranslation });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
        void queryClient.invalidateQueries({ queryKey: ['votd', 'today'] });
        void queryClient.invalidateQueries({ queryKey: ['featured-items'] });
        try {
          window.dispatchEvent(
            new CustomEvent('defaultTranslationChanged', {
              detail: { defaultTranslation: selectedTranslation, previousDefault: originalTranslation },
            }),
          );
        } catch {
          /* ignore */
        }

        // Show success toast
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: `Default translation set to ${TRANSLATIONS[selectedTranslation]?.abbreviation || selectedTranslation}`,
              type: 'success',
            },
          })
        );
      } else {
        console.error('DefaultTranslationPanel: Update failed:', data);
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              message: data.error || 'Failed to save translation. Please try again.',
              type: 'error',
            },
          })
        );
      }
    } catch (error) {
      console.error('DefaultTranslationPanel: Error updating translation:', error);
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            message: 'Error saving translation. Please try again.',
            type: 'error',
          },
        })
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`}>
      <div className="flex-fill flex-stack" style={{ gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>Preferred Bible</p>
            </div>
          </div>

          <div className="panel__body">
            <div className="panel__content">
              <div className="panel__content-scroll">
              {/* Translation list */}
              <div className="flex flex-col gap-2 w-full">
                {[...TRANSLATION_ORDER].sort((a, b) => {
                  // Selected always first
                  if (a === selectedTranslation) return -1;
                  if (b === selectedTranslation) return 1;
                  // Keep KJV and NKJV together (NKJV right after KJV)
                  const isKjvGroup = (id: string) => id === 'KJV' || id === 'NKJV';
                  if (isKjvGroup(a) && isKjvGroup(b)) {
                    return a === 'KJV' ? -1 : 1;
                  }
                  if (isKjvGroup(a)) return TRANSLATIONS['KJV'].name.localeCompare(TRANSLATIONS[b].name);
                  if (isKjvGroup(b)) return TRANSLATIONS[a].name.localeCompare(TRANSLATIONS['KJV'].name);
                  return TRANSLATIONS[a].name.localeCompare(TRANSLATIONS[b].name);
                }).map((id) => {
                  const t = TRANSLATIONS[id];
                  const isSelected = id === selectedTranslation;

                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedTranslation(id)}
                      className="space-button w-full"
                      style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                    >
                      <div className="flex-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                        <div className="flex-row flex-fill" style={{ gap: '0.75rem' }}>
                          {/* Abbreviation pill */}
                          <div
                            className="flex-center rounded-[12px] shrink-0"
                            style={{
                              backgroundColor: isSelected
                                ? 'var(--color-deep-grey)'
                                : 'rgba(120,118,111,0.1)',
                              padding: '4px 8px',
                            }}
                          >
                            <span
                              className={isSelected ? 'translation-abbrev--selected' : ''}
                              style={{
                                fontSize: '11px',
                                lineHeight: 'normal',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                color: isSelected ? 'white' : 'var(--color-deep-grey)',
                                fontFamily: 'var(--font-sans)',
                                fontWeight: 600,
                                letterSpacing: '0.02em',
                              }}
                            >
                              {t.abbreviation}
                            </span>
                          </div>

                          {/* Translation name */}
                          <span className="text-[var(--color-deep-grey)] font-sans text-[16px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0 text-left">
                            {t.name}
                          </span>

                          {/* Checkmark for selected */}
                          {isSelected && (
                            <div className="relative shrink-0 w-5 h-5">
                              <svg
                                className="block max-w-none w-full h-full fill-[var(--color-deep-grey)]"
                                viewBox="0 0 448 512"
                              >
                                <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-2.622px_0px_0px_inset_rgba(176,176,176,0.25)]" />
                    </button>
                  );
                })}
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="panel__footer--buttons">
        {/* Back button */}
        <SquareButton
          variant="Back"
          backIconDirection={backIconDirection}
          onClick={handleClose}
          inBottomSheet={inBottomSheet}
        />

        {/* Save button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting || !hasChanges}
          data-outer-shadow
          className="btn-cta flex-1 group"
          tabIndex={3}
        >
          <span className="btn-cta__content">
            {isSubmitting ? 'Saving...' : 'Save translation'}
          </span>
          <div className="btn-cta__shadow" />
        </button>
      </div>
    </div>
  );
}
