'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import SquareButton from './SquareButton';
import { safeRenderHtml } from '@/utils/content-renderer';
import { getCachedProfileData } from '@/utils/profile-cache';
import { getTranslation, TRANSLATIONS, TRANSLATION_ORDER } from '@/data/translations';

const SCRIPTURE_COMPARE_LAST_TRANSLATION_KEY = 'scriptureCompareLastTranslation';

function readStoredCompareTranslation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(SCRIPTURE_COMPARE_LAST_TRANSLATION_KEY);
    if (v && v in TRANSLATIONS) return v;
  } catch {
    /* ignore */
  }
  return null;
}

function persistCompareTranslation(id: string): void {
  if (typeof window === 'undefined' || !(id in TRANSLATIONS)) return;
  try {
    localStorage.setItem(SCRIPTURE_COMPARE_LAST_TRANSLATION_KEY, id);
  } catch {
    /* ignore */
  }
}

function noteTranslationFromProps(initialVersion: string): string {
  return initialVersion || getCachedProfileData()?.defaultTranslation || 'NET';
}

function getInitialComparePanelState(initialVersion: string, initialContent: string) {
  const noteV = noteTranslationFromProps(initialVersion);
  const preferred = readStoredCompareTranslation() ?? noteV;
  const needFetch = preferred !== noteV;
  return {
    selectedVersion: preferred,
    verseContent: needFetch ? '' : initialContent,
    isLoading: needFetch,
  };
}

async function fetchCompareVerse(reference: string, translation: string): Promise<string | null> {
  try {
    const res = await fetch('/api/scripture/fetch-verse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reference, translation }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.text && typeof data.text === 'string') return data.text;
  } catch {
    /* ignore */
  }
  return null;
}

export interface ScriptureComparePanelProps {
  noteId: string;
  scriptureReference: string;
  initialContent: string;
  initialVersion: string;
  onClose: () => void;
  inBottomSheet?: boolean;
}

/**
 * Read-only scripture viewer with translation switcher (Compare panel).
 */
export default function ScriptureComparePanel({
  noteId: _noteId,
  scriptureReference,
  initialContent,
  initialVersion,
  onClose,
  inBottomSheet = false,
}: ScriptureComparePanelProps) {
  const s0 = getInitialComparePanelState(initialVersion, initialContent);
  const [selectedVersion, setSelectedVersion] = useState(s0.selectedVersion);
  const [verseContent, setVerseContent] = useState(s0.verseContent);
  const [isLoading, setIsLoading] = useState(s0.isLoading);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const noteV = noteTranslationFromProps(initialVersion);
    const preferred = readStoredCompareTranslation() ?? noteV;
    setSelectedVersion(preferred);

    if (preferred === noteV) {
      setVerseContent(initialContent);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setVerseContent('');
    void (async () => {
      const text = await fetchCompareVerse(scriptureReference, preferred);
      if (cancelled) return;
      if (text) setVerseContent(text);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [scriptureReference, initialContent, initialVersion]);

  useEffect(() => {
    if (!showVersionDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowVersionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVersionDropdown]);

  const handleClose = () => {
    onClose();
  };

  const handleVersionChange = useCallback(async (newVersion: string) => {
    setSelectedVersion(newVersion);
    persistCompareTranslation(newVersion);
    setIsLoading(true);
    try {
      const text = await fetchCompareVerse(scriptureReference, newVersion);
      if (text) setVerseContent(text);
    } finally {
      setIsLoading(false);
    }
  }, [scriptureReference]);

  const translationInfo = getTranslation(selectedVersion);

  return (
    <div className={`scripture-compare-panel panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
      <div className={inBottomSheet ? 'flex-fill flex-stack' : 'flex-stack'} style={{ gap: 0, position: 'relative' }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>Compare</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              <div className="panel__content-scroll">
                {/* Same shell as ScriptureNoteForm (NewNotePanel) so translation pill matches pixel-for-pixel */}
                <div
                  className="box-border flex flex-col flex-1 min-h-0 items-start pt-3 px-3 relative"
                  style={{ maxHeight: '100%', width: '100%' }}
                >
                  <div className="flex gap-3 items-center justify-center relative shrink-0 w-full">
                    <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                      <p className="w-full m-0 text-[24px] font-bold text-[var(--color-deep-grey)] leading-tight">
                        {scriptureReference}
                      </p>
                    </div>
                    <div className="relative shrink-0" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isLoading) return;
                          setShowVersionDropdown(!showVersionDropdown);
                        }}
                        className="translation-dropdown-trigger"
                        aria-busy={isLoading}
                        aria-expanded={showVersionDropdown}
                        aria-haspopup="listbox"
                      >
                        <span>{selectedVersion}</span>
                        <svg
                          className={`translation-dropdown-chevron${showVersionDropdown ? ' translation-dropdown-chevron--open' : ''}`}
                          viewBox="0 0 512 512"
                        >
                          <path fill="currentColor" d="M233.4 406.6c12.5 12.5 32.8 12.5 45.3 0l192-192c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L256 338.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l192 192z" />
                        </svg>
                      </button>
                      {showVersionDropdown && (
                        <div className="translation-dropdown-menu" role="listbox">
                          {[selectedVersion, ...TRANSLATION_ORDER.filter((id) => id !== selectedVersion)].map((id) => {
                            const t = TRANSLATIONS[id];
                            const isSelected = id === selectedVersion;
                            return (
                              <button
                                key={id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  void handleVersionChange(id);
                                  setShowVersionDropdown(false);
                                }}
                                className={`translation-dropdown-item${isSelected ? ' translation-dropdown-item--selected' : ''}`}
                              >
                                <span className="translation-dropdown-abbr">{t.abbreviation}</span>
                                <span className="translation-dropdown-name">{t.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                <div
                  className="scripture-compare-panel__verse w-full"
                  style={{
                    marginTop: '20px',
                    opacity: isLoading ? 0.5 : 1,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <div
                    className="font-sans text-[var(--color-deep-grey)] scripture-compare-panel__verse-inner"
                    dangerouslySetInnerHTML={{ __html: safeRenderHtml(verseContent) }}
                  />
                </div>

                  {translationInfo && (
                  <div
                    className="panel__attribution"
                    style={{
                      padding: '1rem',
                      borderTop: '1px solid oklch(0.96 0 0)',
                      marginTop: '1.5rem',
                      flexShrink: 0,
                    }}
                  >
                    <p
                      style={{
                        fontSize: '10px',
                        lineHeight: '1.4',
                        color: 'var(--color-pebble-grey)',
                        margin: 0,
                        textAlign: 'left',
                        paddingRight: '96px',
                      }}
                    >
                      {translationInfo.copyright}{' '}
                      <a
                        href={translationInfo.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: 'var(--color-pebble-grey)',
                          textDecoration: 'underline',
                          textDecorationColor: 'var(--color-pebble-grey)',
                        }}
                      >
                        {translationInfo.abbreviation}
                      </a>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="panel__footer--buttons">
          <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
        </div>
      </div>

      <style>{`
        .scripture-compare-panel .panel__content-scroll {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        .scripture-compare-panel__verse {
          flex: 0 0 auto;
        }
        .scripture-compare-panel__verse-inner {
          font-size: 16px;
          line-height: 1.5;
        }
        .scripture-compare-panel__verse-inner sup {
          font-size: 0.75em;
        }
      `}</style>
    </div>
  );
}
