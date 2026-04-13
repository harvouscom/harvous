import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import ButtonSmall from './ButtonSmall';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl, extractIdFromPath } from '@/utils/url-helpers';
import { pushNavStack } from '@/utils/nav-stack';
import { findFirstUnmarkedTextPosition, wrapTextWithNoteLink, stripNoteLinksToNoteId } from '@/utils/tiptap-helpers';
import { debug } from '@/utils/logger';
import { safeRenderHtml } from '@/utils/content-renderer';
import { getOrCreateScriptureNote } from '@/utils/scripture-note-utils';
import { getTranslation, getTranslationAbbreviationDisplay } from '@/data/translations';
import { withScripturePillDisplayLabels } from '@/utils/scripture-pill-display';
import { getCachedProfileData } from '@/utils/profile-cache';
import { isNoteUnlocked, lockNote } from '@/utils/note-unlock-state';
import { useIsOffline } from '@/hooks/useIsOffline';
import '@/styles/card-full-editable.css';
import Icon from './Icon';
import SharedNoteCTAFooter from './SharedNoteCTAFooter';
import LockNoteButton from './LockNoteButton';
import InlinePinUnlock from './InlinePinUnlock';

// Lazy load TiptapEditor to reduce initial bundle size - only loads when user enters edit mode
const TiptapEditor = lazy(() => import('./TiptapEditor'));

/** Heuristic: avoid ever rendering encrypted blob as HTML (e.g. race where content branch would show it). */
function looksLikeEncryptedBlob(s: string): boolean {
  if (!s || typeof s !== 'string' || s.length < 40) return false;
  const t = s.trim();
  return t.length >= 40 && /^[A-Za-z0-9+/]+=*$/.test(t);
}

// Title character limits
const TITLE_SOFT_LIMIT = 30;  // Show counter when >= 30
const TITLE_WARNING_LIMIT = 45;  // Red text when >= 45 (within 5 of limit)
const TITLE_HARD_LIMIT = 50;  // Maximum allowed

interface CardFullEditableProps {
  title: string;
  content: string;
  date: string;
  noteId?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  version?: string;
  resourceTitle?: string;
  resourceDescription?: string;
  resourceImage?: string;
  resourceUrl?: string;
  contentEncrypted?: boolean;
  className?: string;
  isEditable?: boolean;
  onSave?: (title: string, content: string) => Promise<any>;
  footer?: React.ReactNode;
  // Props for shared note CTA footer
  shareToken?: string;
  isAuthenticated?: boolean;
  /** When true, runs iOS focus scroll fix (window.scrollTo(0,0) on focusin) so toolbar stays visible. Also run on touch devices when false. */
  inBottomSheet?: boolean;
  /** Welcome-thread pack notes (system): same as scripture — no title/body editing in the card. */
  readOnlyLikeScripture?: boolean;
}

export default function CardFullEditable({ 
  title, 
  content, 
  date, 
  noteId,
  noteType = 'default',
  version,
  resourceTitle,
  resourceDescription,
  resourceImage,
  resourceUrl,
  contentEncrypted = false,
  className = '',
  isEditable = true,
  onSave,
  footer,
  shareToken,
  isAuthenticated,
  inBottomSheet = false,
  readOnlyLikeScripture = false,
}: CardFullEditableProps) {
  // Override isEditable for scripture notes, onboarding pack notes, and offline (create-only mode)
  const isCurrentlyOffline = useIsOffline();
  const effectiveIsEditable =
    noteType === 'scripture' || readOnlyLikeScripture || isCurrentlyOffline ? false : isEditable;
  const resolvedScriptureVersion = noteType === 'scripture'
    ? (version || getCachedProfileData()?.defaultTranslation || 'NET')
    : undefined;
  
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isContentEditing, setIsContentEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [displayContent, setDisplayContent] = useState(content);
  const [displayScriptureVersion, setDisplayScriptureVersion] = useState(resolvedScriptureVersion);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const contentDisplayRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const shouldFocusEditorRef = useRef(false);
  const contentClickCoordsRef = useRef<{ contentX: number; contentY: number } | null>(null);
  const saveChangesRef = useRef<() => void>(() => {});
  const [scrollPosition, setScrollPosition] = useState(0);
  const [parentThreadId, setParentThreadId] = useState<string | undefined>(undefined);
  // Track if we've updated content locally (e.g., with a highlight)
  const hasLocalContentUpdate = useRef(false);
  // Skip next init-effect overwrite when we just set decrypted content from pinEntryComplete (avoids race where effect runs with stale lockStateOverride and overwrites with encrypted content)
  const skipNextContentSyncRef = useRef(false);
  // Local lock state override when user locks/unlocks via dialog (avoids full page refresh)
  const [lockStateOverride, setLockStateOverride] = useState<boolean | null>(null);
  const [serverEncryptedOverride, setServerEncryptedOverride] = useState<boolean | null>(null);
  const effectiveEncrypted = lockStateOverride ?? contentEncrypted;
  const effectiveServerEncrypted = serverEncryptedOverride ?? contentEncrypted;
  const cardRootRef = useRef<HTMLDivElement>(null);

  // Mobile keyboard: when keyboard opens (visualViewport shrinks), set CSS vars on card root so toolbar floats 12px above keyboard and editor scrolls (same as NewNotePanel in sheet)
  const RESERVE_EDITOR_PX = 130;
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

    const clearOverrides = (element: HTMLDivElement | null) => {
      if (!element) return;
      element.style.removeProperty('--toolbar-bottom');
      element.style.removeProperty('--editor-scroll-max-height');
      element.removeAttribute('data-keyboard-open');
    };

    const apply = (estimatedViewportHeight?: number) => {
      const el = cardRootRef.current;
      const viewport = window.visualViewport;
      if (!el || !viewport) return;
      const innerH = window.innerHeight;
      let effectiveHeight: number;
      if (estimatedViewportHeight != null && viewport.height > innerH * 0.85) {
        effectiveHeight = estimatedViewportHeight;
      } else {
        effectiveHeight = viewport.height;
      }
      const keyboardOpen = effectiveHeight < innerH * 0.75;

      if (keyboardOpen) {
        const toolbarBottom = innerH - effectiveHeight + 12;
        const editorH = Math.max(120, effectiveHeight - RESERVE_EDITOR_PX);
        el.style.setProperty('--toolbar-bottom', `${toolbarBottom}px`);
        el.style.setProperty('--editor-scroll-max-height', `${editorH}px`);
        el.setAttribute('data-keyboard-open', '');
      } else {
        clearOverrides(el);
      }
    };

    apply();
    const raf = requestAnimationFrame(() => apply());
    const onViewportChange = () => apply();
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);

    const onFocusIn = () => {
      setTimeout(apply, 100);
      setTimeout(apply, 300);
      if (isIOS) {
        setTimeout(apply, 400);
        setTimeout(apply, 600);
        const estimatedHeight = Math.round(window.innerHeight * 0.55);
        if (estimatedHeight < window.innerHeight * 0.75) {
          setTimeout(() => apply(estimatedHeight), 50);
        }
      }
    };
    let focusEl: HTMLDivElement | null = null;
    const rafFocus = requestAnimationFrame(() => {
      focusEl = cardRootRef.current;
      if (focusEl) focusEl.addEventListener('focusin', onFocusIn);
    });

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafFocus);
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
      if (focusEl) focusEl.removeEventListener('focusin', onFocusIn);
      clearOverrides(cardRootRef.current);
    };
  }, []);

  // iOS focus scroll fix: when in bottom sheet or on touch device, reset window scroll on focusin so Safari doesn't push toolbar off
  useEffect(() => {
    const el = cardRootRef.current;
    if (!el) return;
    const isTouchDevice = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (!inBottomSheet && !isTouchDevice) return;

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const handler = () => {
      const t = setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
      timeouts.push(t);
    };
    el.addEventListener('focusin', handler);
    return () => {
      el.removeEventListener('focusin', handler);
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [inBottomSheet]);

  // Reset local-content flag when note changes so we accept new content from props
  useEffect(() => {
    hasLocalContentUpdate.current = false;
  }, [noteId]);

  useEffect(() => {
    setDisplayScriptureVersion(resolvedScriptureVersion);
  }, [resolvedScriptureVersion]);

  const SOURCE_NOTE_CONTENT_KEY = 'harvous-source-note-content';
  const SOURCE_NOTE_CONTENT_AT_KEY = 'harvous-source-note-content-at';
  const SOURCE_NOTE_CONTENT_TTL_MS = 30000;

  // Initialize display content (and apply any pending sessionStorage update from createHyperlink when card wasn't mounted)
  useEffect(() => {
    setDisplayTitle(title);
    if (skipNextContentSyncRef.current) {
      skipNextContentSyncRef.current = false;
      return;
    }
    // Don't overwrite displayContent with encrypted prop when note is unlocked in session
    if (contentEncrypted && lockStateOverride === false) return;

    if (noteId != null && typeof window !== 'undefined') {
      try {
        const pendingContent = sessionStorage.getItem(`${SOURCE_NOTE_CONTENT_KEY}-${noteId}`);
        const pendingAt = sessionStorage.getItem(`${SOURCE_NOTE_CONTENT_AT_KEY}-${noteId}`);
        if (pendingContent != null && pendingAt != null) {
          const at = parseInt(pendingAt, 10);
          if (!isNaN(at) && Date.now() - at < SOURCE_NOTE_CONTENT_TTL_MS) {
            hasLocalContentUpdate.current = true;
            setDisplayContent(pendingContent);
            setEditContent(pendingContent);
            sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_KEY}-${noteId}`);
            sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_AT_KEY}-${noteId}`);
            return;
          }
          sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_KEY}-${noteId}`);
          sessionStorage.removeItem(`${SOURCE_NOTE_CONTENT_AT_KEY}-${noteId}`);
        }
      } catch {
        // ignore
      }
    }

    // Only reset displayContent if we haven't updated it locally
    // This prevents the highlight from disappearing when content prop updates
    if (!hasLocalContentUpdate.current) {
      setDisplayContent(content);
    }
  }, [title, content, contentEncrypted, lockStateOverride, noteId]);

  // Reset lock state overrides when contentEncrypted prop changes (e.g. from server)
  useEffect(() => {
    setLockStateOverride(null);
    setServerEncryptedOverride(null);
  }, [contentEncrypted]);

  // Update content and lock state when PIN panel completes (lock/unlock from panel or bottom sheet)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.noteId != null && detail?.newContent !== undefined && String(detail.noteId) === String(noteId)) {
        skipNextContentSyncRef.current = true;
        setDisplayContent(detail.newContent);
        setLockStateOverride(detail.encrypted === true);
        setServerEncryptedOverride(detail.contentEncryptedServer ?? (detail.encrypted === true));
        if (detail.encrypted === true && noteId != null) {
          lockNote(String(noteId));
        }
        window.dispatchEvent(new CustomEvent('noteLockStateChanged', {
          detail: {
            noteId: String(noteId),
            contentEncrypted: detail.encrypted === true,
            contentEncryptedServer: detail.contentEncryptedServer ?? (detail.encrypted === true)
          }
        }));
      }
    };
    window.addEventListener('pinEntryComplete', handler);
    return () => window.removeEventListener('pinEntryComplete', handler);
  }, [noteId]);

  // Notify layout (e.g. ActionStrip dock) to hide when in edit mode (content or title)
  useEffect(() => {
    const editing = isContentEditing || isTitleEditing;
    window.dispatchEvent(new CustomEvent('contentEditModeChange', { detail: { editing } }));
    return () => {
      window.dispatchEvent(new CustomEvent('contentEditModeChange', { detail: { editing: false } }));
    };
  }, [isContentEditing, isTitleEditing]);

  const [contentViewTopFade, setContentViewTopFade] = useState(false);
  const [contentViewBottomFade, setContentViewBottomFade] = useState(false);

  const viewScrollMaskClasses = [
    contentViewTopFade ? 'card-full-editable__content-scroll--top-fade' : '',
    contentViewBottomFade ? 'card-full-editable__content-scroll--bottom-fade' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** Injected before dangerouslySetInnerHTML so labels survive re-renders (DOM-only hydration flickers). */
  const viewContentHtml = useMemo(
    () => safeRenderHtml(withScripturePillDisplayLabels(displayContent ?? '')),
    [displayContent],
  );

  useEffect(() => {
    if (isContentEditing) {
      setContentViewTopFade(false);
      setContentViewBottomFade(false);
      return;
    }
    const el = contentDisplayRef.current;
    if (!el) return;

    const syncViewScrollMask = () => {
      const t = contentDisplayRef.current;
      if (!t) {
        setContentViewTopFade(false);
        setContentViewBottomFade(false);
        return;
      }
      const { overflowY, overflow } = window.getComputedStyle(t);
      const scrollable =
        overflowY === 'auto' ||
        overflowY === 'scroll' ||
        overflow === 'auto' ||
        overflow === 'scroll';
      if (!scrollable) {
        setContentViewTopFade(false);
        setContentViewBottomFade(false);
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = t;
      const overflowing = scrollHeight > clientHeight + 1;
      setContentViewTopFade(overflowing && scrollTop > 0);
      setContentViewBottomFade(overflowing && scrollTop + clientHeight < scrollHeight - 2);
    };

    syncViewScrollMask();
    const timer = setTimeout(syncViewScrollMask, 50);
    const raf = requestAnimationFrame(syncViewScrollMask);
    el.addEventListener('scroll', syncViewScrollMask, { passive: true });
    const ro = new ResizeObserver(syncViewScrollMask);
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', syncViewScrollMask);
      ro.disconnect();
    };
  }, [
    isContentEditing,
    displayContent,
    resourceDescription,
    noteType,
    noteId,
    lockStateOverride,
    effectiveEncrypted,
    imageRemoved,
  ]);

  // Focus handling is now done directly in startEditing
  // This useEffect is kept for backward compatibility but focusTarget is no longer used

  // Listen for keyboard shortcut to start editing
  useEffect(() => {
    const handleEditNote = () => {
      if (!isContentEditing && !isTitleEditing && effectiveIsEditable) {
        // Save current scroll position
        if (contentDisplayRef.current) {
          const currentScroll = contentDisplayRef.current.scrollTop;
          setScrollPosition(currentScroll);
        }
        
        setEditTitle(displayTitle);
        setEditContent(displayContent);
        setIsContentEditing(true);
        setHasChanges(false);
        
        // Focus editor when it's ready
        shouldFocusEditorRef.current = true;
      }
    };
    
    window.addEventListener('editNote', handleEditNote);
    return () => {
      window.removeEventListener('editNote', handleEditNote);
    };
  }, [isContentEditing, isTitleEditing, effectiveIsEditable, displayTitle, displayContent]);

  // Listen for hyperlink creation event
  useEffect(() => {
    const handleCreateHyperlink = async (event: CustomEvent) => {
        const { sourceNoteId, newNoteId, from, to, plainText } = event.detail;

        // Only process if this is the source note
        if (sourceNoteId !== noteId) return;

        // Try editor-based approach first (if editor is available)
        if (editorInstanceRef.current) {
            const editor = editorInstanceRef.current;
            
            // Check if editor is still valid (not destroyed)
            if (editor && !editor.isDestroyed && editor.view && editor.view.docView) {
              // Helper function to apply noteLink mark at a specific position
              const applyNoteLink = (positionFrom: number, positionTo: number): boolean => {
              try {
                // Validate positions are within document bounds
                const docSize = editor.state.doc.content.size;
                if (positionFrom < 0 || positionTo < 0 || positionFrom >= docSize || positionTo > docSize || positionFrom >= positionTo) {
                  console.warn('[CardFullEditable] Invalid position range:', { positionFrom, positionTo, docSize });
                  return false;
                }

                const pillType = editor.schema.marks.scripturePill;
                if (pillType && editor.state.doc.rangeHasMark(positionFrom, positionTo, pillType)) {
                  return false;
                }

                // Use Tiptap API to apply the mark
                editor.chain()
                    .focus()
                    .setTextSelection({ from: positionFrom, to: positionTo })
                    .unsetAllMarks()
                    .setMark('noteLink', { noteId: newNoteId })
                    .setTextSelection(positionTo)  // Move cursor to end of link
                    .unsetAllMarks()        // Clear marks so new text isn't linked
                    .run();

                return true;
              } catch (e) {
                console.error('[CardFullEditable] Error applying noteLink mark:', e);
                return false;
              }
              };

            // Helper function to save the updated content
            const saveUpdatedContent = () => {
              setTimeout(async () => {
                  // Check again if editor is still valid
                  if (!editor || editor.isDestroyed) return;
                  if (!editor.view || !editor.view.docView) return;
                  
                  try {
                    const updatedContent = editor.getHTML();
                    // Mark that we've updated content locally to prevent useEffect from resetting it
                    hasLocalContentUpdate.current = true;
                    // Update both editContent and displayContent so highlight is visible in both edit and view modes
                    setEditContent(updatedContent);
                    setDisplayContent(updatedContent);
                    
                    // Trigger save
                    if (onSave) {
                        await onSave(editTitle, updatedContent);
                    } else {
                        const globalCallback = (window as any).noteSaveCallback;
                        if (globalCallback) {
                            await globalCallback(editTitle, updatedContent);
                        }
                    }

                    // Notify that highlight has been saved (so navigation can proceed)
                    window.dispatchEvent(new CustomEvent('highlightSaved'));
                    // Drive immediate UI update and persist for sessionStorage fallback if card remounts
                    try {
                      sessionStorage.setItem('harvous-source-note-content-' + noteId, updatedContent);
                      sessionStorage.setItem('harvous-source-note-content-at-' + noteId, String(Date.now()));
                    } catch { /* ignore */ }
                    window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId, content: updatedContent } }));

                    // Show a temporary confirmation
                    window.dispatchEvent(new CustomEvent('toast', {
                        detail: {
                            message: 'Link created in source note.',
                            type: 'success'
                        }
                    }));
                  } catch (e) {
                    console.error('[CardFullEditable] Error saving updated content:', e);
                    // Still notify even on error so navigation doesn't hang
                    window.dispatchEvent(new CustomEvent('highlightSaved'));
                  }
              }, 50);
              };

              // Try to apply mark using stored positions first
              let success = false;
              if (from !== undefined && to !== undefined) {
                success = applyNoteLink(from, to);
              }

              // If direct position application failed, try text matching fallback
              if (!success) {
                // Try to get plainText from event detail first, fallback to localStorage
                const sourceSelectionPlainText = plainText || localStorage.getItem('newNoteSourceSelectionPlainText');
                
                if (sourceSelectionPlainText && sourceSelectionPlainText.trim().length > 0) {
                  debug('[CardFullEditable] Trying text matching fallback');
                  
                  try {
                    const textPosition = findFirstUnmarkedTextPosition(editor, sourceSelectionPlainText);
                    
                    if (textPosition) {
                      success = applyNoteLink(textPosition.from, textPosition.to);
                      if (success) {
                        debug('[CardFullEditable] Successfully applied noteLink using text matching');
                      } else {
                        console.warn('[CardFullEditable] Found text position but failed to apply mark:', textPosition);
                      }
                    } else {
                      console.warn('[CardFullEditable] Could not find matching text in editor:', sourceSelectionPlainText);
                    }
                  } catch (e) {
                    console.error('[CardFullEditable] Error during text matching fallback:', e);
                  }
                } else {
                  console.warn('[CardFullEditable] No sourceSelectionPlainText available for fallback');
                }
              }

              // If we successfully applied the mark, save the updated content
              if (success) {
                saveUpdatedContent();
                return; // Successfully handled with editor
              }
              // Editor-based approach failed, fall through to HTML manipulation
            }
        }

        // HTML manipulation approach (for when editor is not available or editor approach failed)
        // This handles the case when the note is in view mode (not editing)
        debug('[CardFullEditable] Using HTML manipulation approach');
        
        const sourceSelectionPlainText = plainText || localStorage.getItem('newNoteSourceSelectionPlainText');
        
        if (sourceSelectionPlainText && sourceSelectionPlainText.trim().length > 0 && noteId) {
          try {
            // Get current content: when editor is available (edit mode) use its HTML so we wrap the latest content
            let currentContent = displayContent || content;
            if (editorInstanceRef.current && !editorInstanceRef.current.isDestroyed) {
              try {
                const editorHtml = editorInstanceRef.current.getHTML();
                if (editorHtml) currentContent = editorHtml;
              } catch {
                // Keep displayContent/content
              }
            }
            
            // Try to wrap the text with noteLink in HTML
            const updatedContent = wrapTextWithNoteLink(currentContent, sourceSelectionPlainText, newNoteId);
            
            if (updatedContent) {
              // Save via API directly
              const response = await fetch(`/api/notes/${noteId}/update-content`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({
                  content: updatedContent
                })
              });

              if (response.ok) {
                debug('[CardFullEditable] Highlight saved successfully via API');
                // Mark that we've updated content locally to prevent useEffect from resetting it
                hasLocalContentUpdate.current = true;
                // Update local state to reflect the change immediately
                // This makes the highlight visible without page reload
                // Use functional updates to ensure we're working with latest state
                setDisplayContent(updatedContent);
                setEditContent(updatedContent);
                
                // Notify that highlight has been saved (so navigation can proceed)
                debug('[CardFullEditable] Dispatching highlightSaved event');
                window.dispatchEvent(new CustomEvent('highlightSaved'));
                // Drive immediate UI update and persist for sessionStorage fallback if card remounts
                try {
                  sessionStorage.setItem('harvous-source-note-content-' + noteId, updatedContent);
                  sessionStorage.setItem('harvous-source-note-content-at-' + noteId, String(Date.now()));
                } catch { /* ignore */ }
                window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId, content: updatedContent } }));

                // Show success message
                window.dispatchEvent(new CustomEvent('toast', {
                  detail: {
                    message: 'Link created in source note.',
                    type: 'success'
                  }
                }));
              } else {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                console.error('[CardFullEditable] Failed to save updated content:', errorData);
                window.dispatchEvent(new CustomEvent('toast', {
                  detail: {
                    message: 'Could not create link in source note.',
                    type: 'warning'
                  }
                }));
              }
            } else {
              console.warn('[CardFullEditable] Could not find text to wrap in HTML:', sourceSelectionPlainText);
              window.dispatchEvent(new CustomEvent('toast', {
                detail: {
                  message: 'Could not find selected text to create link.',
                  type: 'warning'
                }
              }));
              window.dispatchEvent(new CustomEvent('highlightSaved'));
            }
          } catch (e) {
            console.error('[CardFullEditable] Error during HTML manipulation fallback:', e);
            window.dispatchEvent(new CustomEvent('toast', {
              detail: {
                message: 'Could not create link in source note.',
                type: 'warning'
              }
            }));
            window.dispatchEvent(new CustomEvent('highlightSaved'));
          }
        } else {
          console.error('[CardFullEditable] Failed to create hyperlink - no plainText available');
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Could not create link in source note.',
              type: 'warning'
            }
          }));
          window.dispatchEvent(new CustomEvent('highlightSaved'));
        }
    };

    window.addEventListener('createHyperlink', handleCreateHyperlink as unknown as EventListener);

    return () => {
        window.removeEventListener('createHyperlink', handleCreateHyperlink as unknown as EventListener);
    };
}, [noteId, onSave, editTitle]); // Dependencies

  // Listen for content-updated events so UI updates immediately (highlight added or link stripped) without refresh
  useEffect(() => {
    const handleSourceNoteContentUpdated = (event: Event) => {
      const { noteId: updatedNoteId, content: updatedContent } = (event as CustomEvent).detail || {};
      if (updatedNoteId != null && String(updatedNoteId) === String(noteId) && typeof updatedContent === 'string') {
        hasLocalContentUpdate.current = true;
        setDisplayContent(updatedContent);
        setEditContent(updatedContent);
      }
    };
    window.addEventListener('sourceNoteContentUpdated', handleSourceNoteContentUpdated as EventListener);
    return () => window.removeEventListener('sourceNoteContentUpdated', handleSourceNoteContentUpdated as EventListener);
  }, [noteId]);

  // When new-note panel closes, apply any pending source-note content from sessionStorage (handles case where card stayed mounted but missed the event)
  useEffect(() => {
    const applyPendingSourceContent = () => {
      if (noteId == null || typeof window === 'undefined') return;
      try {
        const pendingContent = sessionStorage.getItem('harvous-source-note-content-' + noteId);
        const pendingAt = sessionStorage.getItem('harvous-source-note-content-at-' + noteId);
        if (pendingContent != null && pendingAt != null) {
          const at = parseInt(pendingAt, 10);
          if (!isNaN(at) && Date.now() - at < SOURCE_NOTE_CONTENT_TTL_MS) {
            hasLocalContentUpdate.current = true;
            setDisplayContent(pendingContent);
            setEditContent(pendingContent);
          }
          sessionStorage.removeItem('harvous-source-note-content-' + noteId);
          sessionStorage.removeItem('harvous-source-note-content-at-' + noteId);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('closeNewNotePanel', applyPendingSourceContent);
    return () => window.removeEventListener('closeNewNotePanel', applyPendingSourceContent);
  }, [noteId]);

  const DELETED_NOTE_IDS_KEY = 'harvous-deleted-note-ids';
  const MAX_DELETED_IDS = 50;

  // When a note is deleted, record it so we can strip links when the source note is opened later
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const deletedNoteId = event.detail?.noteId;
      if (!deletedNoteId) return;
      try {
        const raw = sessionStorage.getItem(DELETED_NOTE_IDS_KEY);
        const list: string[] = raw ? JSON.parse(raw) : [];
        if (!list.includes(deletedNoteId)) {
          list.push(deletedNoteId);
          sessionStorage.setItem(DELETED_NOTE_IDS_KEY, JSON.stringify(list.slice(-MAX_DELETED_IDS)));
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    return () => window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
  }, []);

  // When a note is deleted, strip any link/highlight to that note from this note's content (if this note is currently mounted)
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const deletedNoteId = event.detail?.noteId;
      if (!deletedNoteId || !noteId || deletedNoteId === noteId) return;
      const currentContent = editorInstanceRef.current && !editorInstanceRef.current.isDestroyed
        ? (() => { try { return editorInstanceRef.current!.getHTML(); } catch { return null; } })()
        : (displayContent || content);
      if (!currentContent || !currentContent.includes('data-note-id')) return;
      const stripped = stripNoteLinksToNoteId(currentContent, deletedNoteId);
      if (stripped === currentContent) return;
      hasLocalContentUpdate.current = true;
      setDisplayContent(stripped);
      setEditContent(stripped);
      if (onSave) {
        onSave(editTitle, stripped).catch(() => {});
      } else {
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) globalCallback(editTitle, stripped);
      }
      // Drive immediate UI update and persist for sessionStorage fallback if card remounts
      try {
        sessionStorage.setItem('harvous-source-note-content-' + noteId, stripped);
        sessionStorage.setItem('harvous-source-note-content-at-' + noteId, String(Date.now()));
      } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId, content: stripped } }));
    };
    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);
    return () => window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
  }, [noteId, displayContent, content, editTitle, onSave]);

  // When this note loads, strip links to any recently deleted notes (handles case where source note wasn't mounted when target was deleted)
  useEffect(() => {
    if (typeof window === 'undefined' || !noteId) return;
    const currentContent = displayContent || content;
    if (!currentContent || !currentContent.includes('data-note-id')) return;
    try {
      const raw = sessionStorage.getItem(DELETED_NOTE_IDS_KEY);
      const deletedIds: string[] = raw ? JSON.parse(raw) : [];
      if (deletedIds.length === 0) return;
      let result = currentContent;
      const strippedIds: string[] = [];
      for (const id of deletedIds) {
        const next = stripNoteLinksToNoteId(result, id);
        if (next !== result) {
          result = next;
          strippedIds.push(id);
        }
      }
      if (strippedIds.length === 0) return;
      hasLocalContentUpdate.current = true;
      setDisplayContent(result);
      setEditContent(result);
      if (onSave) {
        onSave(editTitle, result).catch(() => {});
      } else {
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) globalCallback(editTitle, result);
      }
      const remaining = deletedIds.filter(id => !strippedIds.includes(id));
      sessionStorage.setItem(DELETED_NOTE_IDS_KEY, JSON.stringify(remaining));
    } catch {
      // ignore
    }
  }, [noteId, content, displayContent, editTitle, onSave]);

  // Detect parent thread ID from DOM when editing starts
  useEffect(() => {
    if (isContentEditing || isTitleEditing) {
      // Try to find parent thread ID from data attributes
      // First, check if current element or parent has data-parent-thread-id
      const cardElement = document.querySelector('[data-card-full-editable]');
      let detectedThreadId: string | undefined;
      
      // Check parent elements for data-parent-thread-id
      if (cardElement) {
        const parentWithThreadId = cardElement.closest('[data-parent-thread-id]');
        if (parentWithThreadId) {
          detectedThreadId = (parentWithThreadId as HTMLElement).dataset.parentThreadId;
        } else {
          // Fallback: check for data-note-id element
          const noteElement = document.querySelector('[data-note-id]');
          if (noteElement && (noteElement as HTMLElement).dataset.parentThreadId) {
            detectedThreadId = (noteElement as HTMLElement).dataset.parentThreadId;
          }
        }
      }
      
      // Default to unorganized if not found
      setParentThreadId(detectedThreadId || 'thread_unorganized');
    }
  }, [isContentEditing, isTitleEditing]);


  const startEditing = (focus: 'title' | 'content' = 'title') => {
    // Prevent editing if not editable (scripture, onboarding pack, offline, or shared/member view)
    if (!effectiveIsEditable) {
      return;
    }
    // Don't open editor when note is locked (would show encrypted content)
    if (contentEncrypted && !isNoteUnlocked(noteId ?? '')) {
      return;
    }

    // Save current scroll position
    if (contentDisplayRef.current) {
      const currentScroll = contentDisplayRef.current.scrollTop;
      setScrollPosition(currentScroll);
    }
    
    // For resource notes, use resourceTitle as fallback for initial title
    const initialTitle = (noteType === 'resource') 
      ? (displayTitle || resourceTitle || '') 
      : displayTitle;
    setEditTitle(initialTitle);
    // For resource notes, use resourceDescription as initial content if displayContent is empty
    const initialContent = (noteType === 'resource' && !displayContent && resourceDescription) 
      ? resourceDescription 
      : displayContent;
    setEditContent(initialContent);
    
    // Set the appropriate editing state based on focus
    if (focus === 'title') {
      setIsTitleEditing(true);
      // Focus immediately after state update
      requestAnimationFrame(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
        }
      });
    } else {
      setIsContentEditing(true);
      // Set flag to focus editor when it's ready
      shouldFocusEditorRef.current = true;
    }
    
    setHasChanges(false);
  };

  // Handle editor ready callback
  const handleEditorReady = (editor: any) => {
    if (!editor) return;
    
    editorInstanceRef.current = editor;
    // Focus and set cursor at click position when switching from view to edit
    if (shouldFocusEditorRef.current) {
      shouldFocusEditorRef.current = false;
      const coords = contentClickCoordsRef.current;
      contentClickCoordsRef.current = null;
      const savedScroll = scrollPosition;

      // Restore scroll first so posAtCoords matches the view the user clicked in
      const scrollEl = editor.view?.dom?.closest?.('.tiptap-content') as HTMLElement | null;
      if (scrollEl && savedScroll > 0) {
        scrollEl.scrollTop = savedScroll;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          if (!editor || editor.isDestroyed || !editor.view?.docView) return;
          try {
            editor.commands.focus();
            const doc = editor.state.doc;
            const maxPos = doc.content.size;
            try {
              if (coords && scrollEl && editor.view.posAtCoords) {
                const rect = scrollEl.getBoundingClientRect();
                const viewportX = rect.left + coords.contentX - scrollEl.scrollLeft;
                const viewportY = rect.top + coords.contentY - scrollEl.scrollTop;
                const result = editor.view.posAtCoords({ left: viewportX, top: viewportY });
                const pos = result?.pos;
                if (typeof pos === 'number' && pos >= 1 && pos <= maxPos) {
                  editor.commands.setTextSelection(pos);
                } else {
                  const isEmpty = doc.textContent.trim().length === 0;
                  editor.commands.setTextSelection(isEmpty ? 1 : maxPos);
                }
              } else {
                const isEmpty = doc.textContent.trim().length === 0;
                editor.commands.setTextSelection(isEmpty ? 1 : maxPos);
              }
            } catch {
              const isEmpty = doc.textContent.trim().length === 0;
              editor.commands.setTextSelection(isEmpty ? 1 : maxPos);
            }
            // If cursor landed at the trailing edge of a scripture pill
            // (visually inside the pill's styled box because there's no content after it),
            // insert an empty paragraph after the pill's block and move the cursor there.
            try {
              const sel = editor.state.selection;
              const $pos = sel.$from;
              const parent = $pos.parent;
              const atEndOfParent = $pos.parentOffset === parent.content.size;
              if (atEndOfParent && parent.lastChild?.marks.some((m: any) => m.type.name === 'scripturePill')) {
                const endOfBlock = $pos.after($pos.depth);
                const tr = editor.state.tr;
                tr.insert(endOfBlock, editor.state.schema.nodes.paragraph.create());
                tr.setSelection(TextSelection.create(tr.doc, endOfBlock + 1));
                tr.setMeta('addToHistory', false);
                editor.view.dispatch(tr);
                // Don't mark this structural fix as a user change
                setTimeout(() => setHasChanges(false), 0);
              }
            } catch { /* ignore */ }
          } catch {
            /* ignore */
          }
        });
      });
    }
    // Note: Scripture detection is handled by TiptapEditor's useEffect
    // when content is loaded, so we don't need to trigger it here
  };

  const cancelEdit = () => {
    setIsTitleEditing(false);
    setIsContentEditing(false);
    setEditTitle(displayTitle);
    setEditContent(displayContent);
    setHasChanges(false);
  };

  // Helper function to render save/cancel buttons
  const renderSaveCancelButtons = (paddingClass: string = 'px-3') => (
    <div className={`flex items-center gap-2 mt-3 mb-3 shrink-0 ${paddingClass}`}>
      {/* Character counter - only show when editing title */}
      {isTitleEditing && isTitleFocused && editTitle.length >= TITLE_SOFT_LIMIT && (
        <div 
          style={{
            fontSize: '11px',
            fontFamily: 'var(--font-sans)',
            color: editTitle.length >= TITLE_WARNING_LIMIT 
              ? 'var(--color-red)' 
              : 'var(--color-deep-grey)',
          }}
        >
          {editTitle.length}/{TITLE_HARD_LIMIT}
        </div>
      )}
      <div className="flex gap-2 ml-auto">
        <ButtonSmall
          state="Secondary"
          onClick={cancelEdit}
          disabled={isSaving}
        >
          Cancel
        </ButtonSmall>
        <ButtonSmall
          state="Default"
          onClick={saveChanges}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </ButtonSmall>
      </div>
    </div>
  );

  const saveChanges = async () => {
    if (!hasChanges) {
      setIsTitleEditing(false);
      setIsContentEditing(false);
      return;
    }

    setIsSaving(true);

    try {
      // Get content directly from Tiptap editor to ensure all marks (including scripture pills) are preserved
      let editorContent = editContent;
      
      // First, try to get content from editor instance (most reliable)
      if (editorInstanceRef.current) {
        editorContent = editorInstanceRef.current.getHTML();
      } else {
        // Fallback to hidden input or state
        const hiddenInput = document.querySelector('#edit-note-content') as HTMLInputElement;
        if (hiddenInput && hiddenInput.value) {
          editorContent = hiddenInput.value;
        }
      }

      let saveResult: any = null;
      if (onSave) {
        saveResult = await onSave(editTitle, editorContent);
      } else {
        // Fallback to global save callback
        const globalCallback = (window as any).noteSaveCallback;
        if (globalCallback) {
          saveResult = await globalCallback(editTitle, editorContent);
        }
      }

      // Handle scripture results from the update endpoint (scriptureDeferred when create/update defers processing)
      if (saveResult && window.toast) {
        if (saveResult.scriptureDeferred) {
          window.toast.info('Note saved. Scripture links are being added.');
        } else if (saveResult.scriptureProcessingError) {
          window.toast.warning('Note saved. Some scripture links couldn\'t be created.');
        } else if (saveResult.scriptureResults && saveResult.scriptureResults.length > 0) {
          const createdScriptures = saveResult.scriptureResults.filter(
            (r: any) => r.action === 'created'
          );
          const linkedScriptures = saveResult.scriptureResults.filter(
            (r: any) => r.action === 'added'
          );
          if (createdScriptures.length > 0) {
            const message = createdScriptures.length === 1
              ? `Created scripture note: ${createdScriptures[0].reference}`
              : `Created ${createdScriptures.length} scripture notes`;
            window.toast.info(message);
          } else if (linkedScriptures.length > 0) {
            const message = linkedScriptures.length === 1
              ? `Linked to scripture: ${linkedScriptures[0].reference}`
              : `Linked to ${linkedScriptures.length} scripture notes`;
            window.toast.info(message);
          }
          // Notify lists to refetch (e.g. thread notes, dashboard) when scripture was created or linked
          const hasCreatedOrAdded = createdScriptures.length > 0 || linkedScriptures.length > 0;
          if (hasCreatedOrAdded && typeof window !== 'undefined') {
            const wrapper = document.querySelector(`[data-note-id="${noteId}"]`);
            const parentThreadId = wrapper?.getAttribute('data-parent-thread-id') ?? undefined;
            window.dispatchEvent(new CustomEvent('scriptureNotesUpdated', {
              detail: { noteId, threadId: parentThreadId || undefined, results: saveResult.scriptureResults }
            }));
          }
        }
      }

      // After save, update editor with processedContent (which has all pills as HTML spans)
      // Then convert those HTML spans to marks so they display correctly
      if (saveResult.processedContent && editorInstanceRef.current) {
        const editor = editorInstanceRef.current;
        editor.commands.setContent(saveResult.processedContent, { emitUpdate: false });
        // Run conversion after the editor has applied content (next frame)
        requestAnimationFrame(async () => {
          if (editorInstanceRef.current) {
            const { convertNoteLinksToScripturePills } = await import('./TiptapEditor');
            await convertNoteLinksToScripturePills(editorInstanceRef.current);
            const finalContent = editorInstanceRef.current.getHTML();
            setDisplayTitle(editTitle);
            setDisplayContent(finalContent);
            setIsTitleEditing(false);
            setIsContentEditing(false);
            setHasChanges(false);
          }
        });
      } else {
        // No processed content, just use editor's current HTML
        if (editorInstanceRef.current) {
          editorContent = editorInstanceRef.current.getHTML();
        }
        
        // Update display content
        setDisplayTitle(editTitle);
        setDisplayContent(editorContent);
        setIsTitleEditing(false);
        setIsContentEditing(false);
        setHasChanges(false);
      }
    } catch (error) {
      // Show error toast
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error saving note. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSaving(false);
    }
  };

  // Keep saveChangesRef up to date with the latest saveChanges function
  useEffect(() => {
    saveChangesRef.current = saveChanges;
  });

  // Listen for keyboard shortcut to save when editing (Cmd+S)
  useEffect(() => {
    const handleSaveContent = () => {
      // Only save if we're in edit mode, have changes, and not already saving
      if ((isTitleEditing || isContentEditing) && hasChanges && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [isTitleEditing, isContentEditing, hasChanges, isSaving]);

  // Listen for Cmd+Enter to save (dispatched from TiptapEditor)
  useEffect(() => {
    const handleSubmitPanelForm = () => {
      // Only save if we're in edit mode and not already saving
      // Use saveChangesRef to always call the latest version with current state
      if ((isTitleEditing || isContentEditing) && !isSaving) {
        saveChangesRef.current();
      }
    };
    
    window.addEventListener('submitPanelForm', handleSubmitPanelForm);
    return () => {
      window.removeEventListener('submitPanelForm', handleSubmitPanelForm);
    };
  }, [isTitleEditing, isContentEditing, isSaving]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      saveChanges();
    } else {
      // Handle Select All for title textarea (Cmd+A on Mac, Ctrl+A on Windows/Linux)
      const target = e.target as HTMLTextAreaElement;
      if (target === titleInputRef.current) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
          e.preventDefault();
          target.select();
          return;
        }
        
        // Auto-capitalize first letter for title textarea
        // Check if cursor is at the start of the title textarea
        if (target.selectionStart === 0 && target.selectionEnd === 0) {
          // Cursor is at the start
          if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
            e.preventDefault();
            const capitalized = e.key.toUpperCase();
            // If title is empty, set it to the capitalized letter
            // Otherwise, insert the capitalized letter at the start
            if (editTitle.length === 0) {
              setEditTitle(capitalized);
            } else {
              setEditTitle(capitalized + editTitle);
            }
            // Set cursor position after the capitalized letter
            setTimeout(() => {
              if (titleInputRef.current) {
                titleInputRef.current.setSelectionRange(1, 1);
              }
            }, 0);
          }
        }
      }
    }
  };

  const handleContentChange = (newContent: string) => {
    setEditContent(newContent);
    setHasChanges(editTitle !== displayTitle || newContent !== displayContent);
  };

  const resolveThreadContext = (): string => {
    const currentNoteId = extractIdFromPath(window.location.pathname);
    if (parentThreadId && parentThreadId.startsWith('thread_')) return parentThreadId;
    try {
      const fromQuery = new URLSearchParams(window.location.search).get('thread');
      if (fromQuery && fromQuery.startsWith('thread_')) return fromQuery;
    } catch {
      // ignore
    }
    if (currentNoteId?.startsWith('note_')) {
      try {
        const cached = localStorage.getItem(`harvous-note-thread-${currentNoteId}`);
        if (cached && cached.startsWith('thread_')) return cached;
      } catch {
        // ignore
      }
    }
    const noteEl = document.querySelector('[data-note-id]') as HTMLElement | null;
    if (noteEl?.dataset.parentThreadId?.startsWith('thread_')) {
      return noteEl.dataset.parentThreadId;
    }
    const navEl = document.querySelector('[data-navigation-active="true"]') as HTMLElement | null;
    if (navEl?.dataset.parentThreadId?.startsWith('thread_')) {
      return navEl.dataset.parentThreadId;
    }
    const pathId = extractIdFromPath(window.location.pathname);
    if (pathId?.startsWith('thread_')) return pathId;
    return 'thread_unorganized';
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, TITLE_HARD_LIMIT); // Enforce hard limit
    setEditTitle(newValue);
    setHasChanges(newValue !== displayTitle || editContent !== displayContent);
  };

  // Prefetch scripture note page on hover for faster navigation
  const prefetchedUrls = useRef(new Set<string>());
  const handleContentMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const pillElement = target.closest('.scripture-pill');
    if (!pillElement) return;
    const pillNoteId = pillElement.getAttribute('data-note-id');
    if (!pillNoteId || pillNoteId === 'pending' || pillNoteId === 'null') return;
    const url = idToUrl(pillNoteId, parentThreadId);
    if (prefetchedUrls.current.has(url)) return;
    prefetchedUrls.current.add(url);
    // Inject a prefetch link to warm the browser/SSR cache
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  };

  const handleContentClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    // Check if click is on a note-link (highlighted text linking to another note)
    const target = e.target as HTMLElement;
    const noteLinkElement = target.closest('.note-link');
    
    if (noteLinkElement) {
      const noteId = noteLinkElement.getAttribute('data-note-id');
      
      if (noteId) {
        // Navigate to the linked note
        e.preventDefault();
        e.stopPropagation();
        const currentNoteId = extractIdFromPath(window.location.pathname);
        const threadCtx = resolveThreadContext();
        if (currentNoteId?.startsWith('note_') && threadCtx) {
          pushNavStack(currentNoteId, threadCtx);
        }
        safeNavigate(idToUrl(noteId, threadCtx, currentNoteId || undefined), { history: 'push' });
        return;
      }
    }

    // Check if click is on a scripture pill
    const pillElement = target.closest('.scripture-pill');
    
    if (pillElement) {
      const noteId = pillElement.getAttribute('data-note-id');
      const reference = pillElement.getAttribute('data-scripture-reference');
      const pillTranslation = pillElement.getAttribute('data-scripture-translation') || getCachedProfileData()?.defaultTranslation || 'NET';

      e.preventDefault();
      e.stopPropagation();

      const threadId = resolveThreadContext();

      // Fast path: If pill already has a valid noteId, navigate immediately.
      // Also fire a non-blocking add-thread so the scripture note is added to
      // whichever thread the user is currently in (handles multi-thread membership).
      if (noteId && noteId !== 'pending' && noteId !== 'null') {
        const currentNoteId = extractIdFromPath(window.location.pathname);
        if (currentNoteId?.startsWith('note_')) {
          pushNavStack(currentNoteId, threadId);
        }
        if (threadId && threadId !== 'thread_unorganized') {
          const targetId = noteId.startsWith('note_') ? noteId : `note_${noteId}`;
          fetch(`/api/notes/${targetId}/add-thread`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId }),
            credentials: 'include',
          })
            .then((res) => {
              if (res.ok) {
                window.dispatchEvent(
                  new CustomEvent('noteAddedToThread', {
                    detail: { noteId: targetId, threadId, source: 'inlineAddThread' },
                  })
                );
              }
            })
            .catch(() => {});
        }
        safeNavigate(idToUrl(noteId, threadId, currentNoteId || undefined), { history: 'push' });
        return;
      }

      // Slow path: noteId is pending/missing — need to check/create the scripture note
      if (reference) {
        try {
          const result = await getOrCreateScriptureNote(reference, threadId, pillTranslation);

          if (result.noteId) {
            // Update the pill's noteId in the DOM so next click is instant
            pillElement.setAttribute('data-note-id', result.noteId);
            const currentNoteId = extractIdFromPath(window.location.pathname);
            if (currentNoteId?.startsWith('note_')) {
              pushNavStack(currentNoteId, threadId);
            }
            safeNavigate(idToUrl(result.noteId, threadId, currentNoteId || undefined), { history: 'push' });
          } else {
            window.dispatchEvent(new CustomEvent('toast', {
              detail: {
                message: 'Could not create scripture note. Please try again.',
                type: 'error'
              }
            }));
          }
        } catch (error) {
          console.error('Error handling scripture note:', error);
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Could not create scripture note. Please try again.',
              type: 'error'
            }
          }));
        }
        return;
      }

      // No reference or noteId available
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Scripture note is pending creation. Please save the note first.',
          type: 'warning'
        }
      }));
      return;
    }
    
    // If not a note-link or scripture pill, enter edit mode (if editable)
    if (effectiveIsEditable) {
      const displayEl = contentDisplayRef.current;
      if (displayEl) {
        const rect = displayEl.getBoundingClientRect();
        contentClickCoordsRef.current = {
          contentX: e.clientX - rect.left + displayEl.scrollLeft,
          contentY: e.clientY - rect.top + displayEl.scrollTop,
        };
      } else {
        contentClickCoordsRef.current = { contentX: e.clientX, contentY: e.clientY };
      }
      startEditing('content');
    }
  };

  // Resource note - special display with card-image-link design + editable content
  if (noteType === 'resource') {
    const effectiveTitle = resourceTitle || displayTitle || 'Untitled Resource';
    
    // Detect if URL is a PDF
    const isPDF = resourceUrl ? (
      resourceUrl.toLowerCase().endsWith('.pdf') ||
      resourceUrl.toLowerCase().includes('.pdf?') ||
      resourceUrl.toLowerCase().includes('.pdf#')
    ) : false;
    
    const hostname = resourceUrl ? (() => {
      try {
        const url = new URL(resourceUrl);
        return url.hostname.replace('www.', '');
      } catch {
        return resourceUrl;
      }
    })() : '';

    // For resource notes, use resourceDescription as initial content if content is empty
    const effectiveContent = displayContent || resourceDescription || '';

    return (
      <div
        ref={cardRootRef}
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%' }}
        data-card-full-editable
        {...((isContentEditing || isTitleEditing) && { 'data-editing': 'true' })}
      >
        <div className="card-image-link" style={{ gap: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Full-width image at top */}
          {resourceImage && !imageRemoved && (
            <div 
              className="card-image-link__image"
              style={{ 
                backgroundImage: `url('${resourceImage}')`,
                minHeight: '180px',
                flexShrink: 0,
                position: 'relative'
              }}
            >
              {/* Remove image button - only show on hover - TEMPORARILY DISABLED */}
              {/* <div className="card-image-link__remove-button">
                <ActionButton
                  variant="Close"
                  onClick={async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    
                    // Update resource metadata to remove image (don't hide immediately to avoid flicker)
                    if (noteId) {
                      try {
                        // Use the notes update endpoint which supports resourceImage updates
                        const response = await fetch(`/api/notes/update`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            noteId: noteId,
                            title: displayTitle,
                            content: displayContent,
                            resourceImage: ''
                          }),
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          if (result.success) {
                            // Only hide and reload after successful update
                            setImageRemoved(true);
                            // Reload the page to reflect the change
                            window.location.reload();
                          } else {
                            // If update fails, show error
                            const errorMessage = result.error || 'Error removing image. Please try again.';
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: errorMessage,
                                type: 'error'
                              }
                            }));
                          }
                        } else {
                          // If response not ok, try to parse error
                          try {
                            const errorResult = await response.json();
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: errorResult.error || 'Error removing image. Please try again.',
                                type: 'error'
                              }
                            }));
                          } catch {
                            window.dispatchEvent(new CustomEvent('toast', {
                              detail: {
                                message: 'Error removing image. Please try again.',
                                type: 'error'
                              }
                            }));
                          }
                        }
                      } catch (error: any) {
                        console.error('Error removing image:', error);
                        window.dispatchEvent(new CustomEvent('toast', {
                          detail: {
                            message: 'Error removing image. Please try again.',
                            type: 'error'
                          }
                        }));
                      }
                    } else {
                      // No noteId, just hide it locally
                      setImageRemoved(true);
                    }
                  }}
                  aria-label="Remove image"
                  className=""
                  style={{
                    width: '32px',
                    height: '32px'
                  }}
                />
              </div> */}
            </div>
          )}
          
          {/* Header with title and newspaper icon */}
          <div className="card-image-link__header" style={{ flexShrink: 0 }}>
            <div className="card-image-link__title" style={{ flex: 1, minWidth: 0 }}>
              {!isTitleEditing ? (
                <p
                  className="cursor-pointer rounded"
                  style={{
                    margin: 0,
                    padding: '4px 8px',
                    marginLeft: '-8px',
                    marginRight: '-8px',
                  }}
                  onClick={effectiveIsEditable ? () => startEditing('title') : undefined}
                >
                  {effectiveTitle}
                </p>
              ) : (
                <div>
                  <textarea 
                    ref={titleInputRef}
                    value={editTitle}
                    onChange={handleTitleChange}
                    maxLength={TITLE_HARD_LIMIT}
                    rows={2}
                    className="w-full bg-transparent border-0 rounded focus:outline-none font-bold"
                    style={{
                      lineHeight: '1.2',
                      margin: 0,
                      padding: '4px 8px',
                      marginLeft: '-8px',
                      marginRight: '-8px',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      fontFamily: 'inherit',
                      color: 'inherit',
                      boxSizing: 'border-box',
                      width: 'calc(100% + 16px)',
                      resize: 'none',
                    }}
                    placeholder="Resource title"
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsTitleFocused(true)}
                    onBlur={() => setIsTitleFocused(false)}
                  />
                </div>
              )}
            </div>
            <div className="card-image-link__bookmark" style={{ marginTop: '4px' }}>
              <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
            </div>
          </div>
          
          {/* Editable content area with TiptapEditor */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, width: '100%', marginTop: '12px' }}>
            {!isContentEditing ? (
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  ref={contentDisplayRef}
                  className={`flex-1 overflow-auto rounded px-3${viewScrollMaskClasses ? ` ${viewScrollMaskClasses}` : ''}`}
                  style={{ lineHeight: '1.6', minHeight: 0, width: '100%', cursor: effectiveIsEditable ? 'text' : 'default' }}
                  onClick={handleContentClick}
                  onMouseOver={handleContentMouseOver}
                >
                  {effectiveContent && effectiveContent.trim() ? (
                    <div
                      className="card-full-editable__content-html card-image-link__content-text"
                      dangerouslySetInnerHTML={{ __html: safeRenderHtml(withScripturePillDisplayLabels(effectiveContent)) }}
                    />
                  ) : (
                    <p style={{ color: 'var(--color-pebble-grey)', fontStyle: 'italic' }}>Click to add notes...</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-fill flex-stack" style={{ gap: 0, width: '100%' }}>
                <div className="flex-1 min-h-0 px-3" style={{ width: '100%', maxHeight: '100%' }}>
                  <Suspense fallback={<div className="min-h-[100px]" />}>
                    <TiptapEditor
                      content={editContent}
                      id="edit-note-content"
                      name="editContent"
                      placeholder="Add your notes about this resource..."
                      tabindex={3}
                      minimalToolbar={false}
                      toolbarAtBottom={true}
                      toolbarBottomMargin={0}
                      onContentChange={handleContentChange}
                      scrollPosition={scrollPosition}
                      enableCreateNoteFromSelection={isContentEditing}
                      parentThreadId={parentThreadId}
                      sourceNoteId={noteId}
                      onEditorReady={handleEditorReady}
                    />
                  </Suspense>
                </div>
                
                {/* Save/Cancel buttons */}
                {isContentEditing && renderSaveCancelButtons('px-3')}
              </div>
            )}
          </div>
          
          {/* Source bar with hostname and external link icon */}
          {resourceUrl && (
            <button
              type="button"
              className="card-image-link__source"
              style={{ textDecoration: 'none', border: 'none', textAlign: 'left', flexShrink: 0 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.open(resourceUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <div className="card-image-link__source-content" style={{ justifyContent: 'space-between' }}>
                <div className="card-image-link__source-text">
                  <p>{isPDF ? 'View PDF' : hostname}</p>
                </div>
                <div className="card-image-link__source-icon">
                  <Icon name={isPDF ? 'file-pdf' : 'arrow-up-right-from-square'} size={20} />
                </div>
              </div>
            </button>
          )}

          {/* Save/Cancel buttons when only title is being edited - shown at bottom */}
          {isTitleEditing && !isContentEditing && renderSaveCancelButtons('px-3')}
        </div>
      </div>
    );
  }

  // Default and Scripture notes - original editable layout
  return (
    <>
      {noteType === 'default' && noteId && (
        <LockNoteButton
          noteId={noteId}
          noteContent={displayContent}
          isEncrypted={effectiveEncrypted}
          serverContentEncrypted={effectiveServerEncrypted}
          serverNoteContent={effectiveServerEncrypted ? content : undefined}
          onContentChange={(newContent) => setDisplayContent(newContent)}
          onLockStateChange={(isLocked) => setLockStateOverride(isLocked)}
          hideButton={true}
        />
      )}
      <div
        ref={cardRootRef}
        className={`card-full-editable ${className}`}
        style={{ maxHeight: '100%', gap: 0, display: 'flex', flexDirection: 'column' }}
        data-card-full-editable
        {...((isContentEditing || isTitleEditing) && { 'data-editing': 'true' })}
      >
      {/* Header with title, version (scripture only), and bookmark icon */}
      <div className="flex gap-3 items-center justify-center relative shrink-0 w-full px-3">
        <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
          {/* Display mode */}
          {!isTitleEditing ? (
            <p 
              className="rounded"
              style={{
                lineHeight: '1.2',
                margin: '-4px -8px',
                padding: '4px 8px',
                display: 'block',
                width: '100%',
                fontSize: '24px',
                fontWeight: '700',
                fontFamily: 'var(--font-sans)',
                color: 'var(--color-deep-grey)',
                boxSizing: 'border-box',
                minHeight: '28.8px',
                height: 'auto',
                verticalAlign: 'middle',
                cursor: effectiveIsEditable ? 'pointer' : 'default'
              }}
              onClick={effectiveIsEditable ? () => startEditing('title') : undefined}
            >
              {displayTitle}
            </p>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea 
                ref={titleInputRef}
                value={editTitle}
                onChange={handleTitleChange}
                maxLength={TITLE_HARD_LIMIT}
                rows={2}
                className="w-full bg-transparent border-0 rounded focus:outline-none font-bold"
                style={{
                  lineHeight: '1.2',
                  margin: '-4px -8px',
                  padding: '4px 8px',
                  fontSize: '24px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--color-deep-grey)',
                  boxSizing: 'border-box',
                  resize: 'none',
                }}
                placeholder="Note title"
                onKeyDown={handleKeyDown}
                onFocus={() => setIsTitleFocused(true)}
                onBlur={() => setIsTitleFocused(false)}
              />
            </div>
          )}
        </div>
        {noteType === 'scripture' ? (
          <>
            {displayScriptureVersion && (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 'normal',
                  color: 'var(--color-stone-grey)',
                  flexShrink: 0,
                }}
              >
                {getTranslationAbbreviationDisplay(displayScriptureVersion)}
              </span>
            )}
            <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
              <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)' }} />
            </div>
          </>
        ) : (
          /* Icon only for non-scripture notes */
          (() => {
            const noteTypeConfig: Record<'resource' | 'default', { label: string; icon: React.ReactElement }> = {
              resource: {
                label: 'Resource',
                icon: <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)' }} />
              },
              default: {
                label: 'Note',
                icon: (
                  <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                )
              }
            };
            const config = noteTypeConfig[noteType];
            return (
              <div className="relative shrink-0 size-5" title={`${config.label} type`} style={{ marginTop: '4px' }}>
                {config.icon}
              </div>
            );
          })()
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 w-full" style={{ maxHeight: '100%', overflow: 'hidden', marginTop: '12px' }}>
        <div className="flex-1 flex flex-col font-sans font-medium min-h-0 not-italic text-[var(--color-deep-grey)] text-[16px]">
          {/* Display mode */}
          {!isContentEditing ? (
              <div className="flex-fill flex-stack" style={{ gap: 0, maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3 relative" style={{ minHeight: 0, overflow: 'hidden' }}>
                {(effectiveEncrypted && !isNoteUnlocked(noteId ?? '')) || (contentEncrypted && looksLikeEncryptedBlob(displayContent ?? '')) ? (
                  <div ref={contentDisplayRef} className="flex flex-col shrink-0">
                    {noteId != null ? (
                      <InlinePinUnlock noteId={String(noteId)} encryptedContent={displayContent ?? ''} />
                    ) : (
                      <p>This note is locked. Tap Unlock to view.</p>
                    )}
                  </div>
                ) : displayContent && displayContent.trim() ? (
                  <div 
                    ref={contentDisplayRef}
                    className={`card-full-editable__content-html flex-1 overflow-auto rounded${viewScrollMaskClasses ? ` ${viewScrollMaskClasses}` : ''}`}
                    style={{ lineHeight: '1.6', minHeight: 0, paddingBottom: '96px', cursor: effectiveIsEditable ? 'text' : 'default' }}
                    onClick={handleContentClick}
                    onMouseOver={handleContentMouseOver}
                    dangerouslySetInnerHTML={{ __html: viewContentHtml }}
                  />
                ) : (
                  <div 
                    ref={contentDisplayRef}
                    className={`flex-1 overflow-auto rounded${viewScrollMaskClasses ? ` ${viewScrollMaskClasses}` : ''}`}
                    style={{ lineHeight: '1.6', minHeight: 0, paddingBottom: '96px', cursor: effectiveIsEditable ? 'text' : 'default' }}
                    onClick={handleContentClick}
                  >
                    <p style={{ color: 'var(--color-pebble-grey)', fontStyle: 'italic' }}>Click to add notes...</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-fill flex-stack" style={{ gap: 0, maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3" style={{ maxHeight: '100%' }}>
                <Suspense fallback={<div className="min-h-[200px]" />}>
                  <TiptapEditor
                    content={editContent}
                    id="edit-note-content"
                    name="editContent"
                    placeholder="Start writing your note..."
                    tabindex={3}
                    minimalToolbar={false}
                    toolbarAtBottom={true}
                    toolbarBottomMargin={0}
                    onContentChange={handleContentChange}
                    scrollPosition={scrollPosition}
                    enableCreateNoteFromSelection={isContentEditing}
                    parentThreadId={parentThreadId}
                    sourceNoteId={noteId}
                    onEditorReady={handleEditorReady}
                  />
                </Suspense>
              </div>
              
              {/* Save/Cancel buttons */}
              {isContentEditing && renderSaveCancelButtons('px-3')}
            </div>
          )}
        </div>

        {/* Save/Cancel buttons when only title is being edited - shown at bottom like content editing */}
        {isTitleEditing && !isContentEditing && renderSaveCancelButtons('px-3')}

        {/* Bible Translation Attribution - visible at bottom for scripture notes */}
        {noteType === 'scripture' && displayScriptureVersion && (() => {
          const translationInfo = getTranslation(displayScriptureVersion);
          if (!translationInfo) return null;
          return (
            <div
              className="panel__attribution"
              style={{
                padding: '1rem',
                borderTop: '1px solid oklch(0.96 0 0)',
                marginTop: 'auto',
                flexShrink: 0
              }}
            >
              <p
                style={{
                  fontSize: '10px',
                  lineHeight: '1.4',
                  color: 'var(--color-pebble-grey)',
                  margin: 0,
                  textAlign: 'left',
                  paddingRight: '96px'
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
                    textDecorationColor: 'var(--color-pebble-grey)'
                  }}
                >
                  {translationInfo.abbreviation}
                </a>
              </p>
            </div>
          );
        })()}
        
        {/* Footer - rendered at bottom of card */}
        {footer ? (
          <div 
            style={{
              marginTop: 'auto',
              flexShrink: 0,
              paddingBottom: '12px'
            }}
          >
            {footer}
          </div>
        ) : shareToken ? (
          <div 
            style={{
              marginTop: 'auto',
              flexShrink: 0,
              paddingBottom: '12px'
            }}
          >
            <SharedNoteCTAFooter
              shareToken={shareToken}
              isAuthenticated={isAuthenticated || false}
            />
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}
