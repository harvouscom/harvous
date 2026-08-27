/**
 * The toolbar's Notes/Bible switch, as one hook.
 *
 * The reader is a route rather than a mode, so "go back to notes" is not a state the
 * shell already held — it is the last path that wasn't the reader, recorded here and
 * kept in the shell. Falling back to home matters: a deep link straight into a chapter
 * has no notes path behind it, and a switch with a dead half reads as broken.
 *
 * One hook because the control and the keyboard shortcut both need the whole behaviour.
 * They used to hold two copies of the smart-jump navigation, and the copies had already
 * drifted once over which pages count as the reader.
 */
import { useCallback, useEffect } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import {
  isPrototypeAdminPath,
  isPrototypeReadPath,
  isPrototypeSettingsPath,
  prototypeHomeRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';
import { bookSlug } from '@/utils/bible-book-chapters';
import { useProtoShell } from '../layouts/proto-shell-context';
import { useSmartJumpDestination } from './useSmartJumpDestination';

export type ReaderToggle = {
  /** True while the reader is the visible document — the Bible half of the switch is active. */
  isOnReadPage: boolean;
  /** Smart-jump into the reader: continue reading → verse of the day → John 1. */
  openReader: () => void;
  /** Back to the last non-reader path, or home when there isn't one. */
  backToNotes: () => void;
};

export function useReaderToggle(): ReaderToggle {
  const navigate = useNavigate();
  // Primitives only — an object out of `select` re-runs this on every location change.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const { isMobileSidebar, closeDrawer, lastNotesPath, recordNotesPath } = useProtoShell();
  const smartJump = useSmartJumpDestination();

  const isOnReadPage = isPrototypeReadPath(pathname);

  /* Settings and admin are excluded on purpose. They are reachable from inside the shell,
     so without this the Notes half could return you to the account page — which is not
     what the word on the segment says. Home and note paths are what's left, and they are
     exactly "notes". */
  useEffect(() => {
    if (isOnReadPage) return;
    if (isPrototypeSettingsPath(pathname) || isPrototypeAdminPath(pathname)) return;
    recordNotesPath(href);
  }, [href, isOnReadPage, pathname, recordNotesPath]);

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

  const backToNotes = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({ to: (lastNotesPath ?? prototypeHomeRouteTo()) as '/prototype' });
  }, [closeDrawer, isMobileSidebar, lastNotesPath, navigate]);

  return { isOnReadPage, openReader, backToNotes };
}
