/**
 * The toolbar's Activity / Note / Read switch, as one hook.
 *
 * Grew out of `useReaderToggle`, which held the same job for two halves. The third half is
 * not symmetrical with the other two and that is the whole reason this is a hook rather
 * than three onClicks: Read is a route, Note is *whichever* note you last had open, and
 * Activity is the one place that is always there. Each half therefore answers a different
 * question about where you have been, and the control and the keyboard shortcuts both need
 * the same answers — they used to hold two copies of the smart-jump navigation and had
 * already drifted once over which pages count as the reader.
 *
 * Two recorded paths, deliberately not one:
 *
 * - `lastNotesPath` — the last path that wasn't the reader. What Read's return uses.
 * - `lastNoteEditorPath` — the last *note* path. What the Note half uses, because from
 *   Activity the first one is Activity, and a half that returns you where you already are
 *   reads as broken.
 */
import { useCallback, useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  isPrototypeAdminPath,
  isPrototypeHomePath,
  isPrototypeNotePath,
  isPrototypeReadPath,
  isPrototypeSettingsPath,
  prototypeHomeRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';
import { bookSlug } from '@/utils/bible-book-chapters';
import { useProtoShell } from '../layouts/proto-shell-context';
import { useSmartJumpDestination } from './useSmartJumpDestination';

/** Which of the three the shell is showing. */
export type ShellMode = 'activity' | 'note' | 'reader';

export type ShellModeNav = {
  mode: ShellMode;
  /** True while the reader is the visible document. Kept for callers that only ask that. */
  isOnReadPage: boolean;
  /** Whether the Note half would resume something rather than start a new note. */
  hasNoteToResume: boolean;
  openActivity: () => void;
  /** Resume the last note, or start one when there is nothing to resume. */
  openNote: (startNew: () => void) => void;
  /** Back out of the reader to whatever was open before it — a note, or Activity. */
  leaveReader: () => void;
  /** Smart-jump into the reader: continue reading → verse of the day → John 1. */
  openReader: () => void;
};

export function useShellModeNav(): ShellModeNav {
  const navigate = useNavigate();
  // Primitives only — an object out of `select` re-runs this on every location change.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const {
    isMobileSidebar,
    closeDrawer,
    lastNotesPath,
    recordNotesPath,
    lastNoteEditorPath,
    recordNoteEditorPath,
    composeDraftActive,
    clearComposeDraftActive,
  } = useProtoShell();
  const smartJump = useSmartJumpDestination();

  const isOnReadPage = isPrototypeReadPath(pathname);
  const isOnNotePath = isPrototypeNotePath(pathname);

  /*
   * Composing on `/` is the Note mode even though the path is Activity's: the layout hosts
   * the editor in place there rather than routing to it, so the path cannot be trusted on
   * its own. Without this the switch would sit on Activity while the reader is writing.
   */
  const composingOnHome = composeDraftActive && isPrototypeHomePath(pathname);
  const mode: ShellMode = isOnReadPage
    ? 'reader'
    : isOnNotePath || composingOnHome
      ? 'note'
      : 'activity';

  /* Settings and admin are excluded on purpose. They are reachable from inside the shell,
     so without this the return could land you on the account page — which is not what the
     word on the segment says. */
  useEffect(() => {
    if (isOnReadPage) return;
    if (isPrototypeSettingsPath(pathname) || isPrototypeAdminPath(pathname)) return;
    recordNotesPath(href);
    if (isOnNotePath) recordNoteEditorPath(href);
  }, [href, isOnNotePath, isOnReadPage, pathname, recordNoteEditorPath, recordNotesPath]);

  /*
   * Ending the compose session is the whole job when composing on `/`.
   *
   * The layout hosts the editor in place there, so the path is already Activity's and
   * navigating to it changes nothing — the shell's own "compose ended" effect watches for
   * *leaving* `/`, which never happens. Without this the Activity half looks dead precisely
   * when someone most wants out of the editor.
   *
   * The draft itself is untouched: this clears the session, not the stash, exactly as
   * navigating to settings mid-compose does. What was typed comes back with the next
   * compose.
   */
  const openActivity = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    if (composeDraftActive) clearComposeDraftActive();
    void navigate({ to: prototypeHomeRouteTo() });
  }, [clearComposeDraftActive, closeDrawer, composeDraftActive, isMobileSidebar, navigate]);

  const openReader = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({
      to: prototypeReadRouteTo(),
      params: { book: bookSlug(smartJump.book), chapter: String(smartJump.chapter) },
      search: {
        v: smartJump.verse ? String(smartJump.verse) : undefined,
        t: smartJump.translation || undefined,
      },
    });
  }, [closeDrawer, isMobileSidebar, navigate, smartJump]);

  /*
   * Resume beats compose. Somebody who was writing and went to look something up wants
   * their note back, not a blank one — and losing the draft they had open to a new draft is
   * the kind of mistake a switch should never make. `startNew` is passed in rather than
   * called here because beginning a compose session is the toolbar's business, and it needs
   * the space and permission context this hook has no view of.
   *
   * `lastNoteEditorPath` only, never `lastNotesPath` as a fallback: the second includes
   * Activity, so on a session that has not opened a note yet the Note half would navigate
   * to Activity and appear to do nothing. Compose is the honest answer there.
   *
   * Already on a note, the resume branch has nothing to resume: the remembered path IS the
   * current one, and navigating to it was the dead click. So the half takes its second job
   * there, the way the Activity half opens the spaces menu once you are on Activity — press
   * it again and you get a new note. That includes an unsaved draft on `/`: the draft
   * autosaves like any other, and beginning a session clears only a stale one.
   */
  const openNote = useCallback(
    (startNew: () => void) => {
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
      if (mode !== 'note' && lastNoteEditorPath) {
        void navigate({ to: lastNoteEditorPath as '/prototype' });
        return;
      }
      startNew();
    },
    [closeDrawer, isMobileSidebar, lastNoteEditorPath, mode, navigate],
  );

  /*
   * Leaving the reader is its own move, and it is the one place `lastNotesPath` is right:
   * "back" means the thing you were looking at before the chapter, whether that was a note
   * or Activity. Home is the floor, because a deep link straight into a chapter has nothing
   * behind it and a dead key reads as broken.
   */
  const leaveReader = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({ to: (lastNotesPath ?? prototypeHomeRouteTo()) as '/prototype' });
  }, [closeDrawer, isMobileSidebar, lastNotesPath, navigate]);

  return {
    mode,
    isOnReadPage,
    /* False on a note: the half's job there is a new one, and the label and keycap follow. */
    hasNoteToResume: mode !== 'note' && Boolean(lastNoteEditorPath),
    openActivity,
    openNote,
    openReader,
    leaveReader,
  };
}
