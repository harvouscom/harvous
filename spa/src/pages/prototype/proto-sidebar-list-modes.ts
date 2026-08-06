import type { IconName } from '@/components/react/Icon';
import type { SidebarListMode } from '../../layouts/proto-shell-context';

export type SidebarListModeEntry = {
  mode: SidebarListMode;
  icon: IconName;
  label: string;
};

export const SIDEBAR_LIST_MODES: readonly SidebarListModeEntry[] = [
  { mode: 'notes', icon: 'note-sticky', label: 'Notes' },
  { mode: 'folders', icon: 'folder', label: 'Folders' },
  { mode: 'threads', icon: 'arrow-right-arrow-left', label: 'Threads' },
  { mode: 'highlights', icon: 'highlighter', label: 'Highlights' },
  { mode: 'scripture', icon: 'scroll', label: 'Scripture' },
  { mode: 'resources', icon: 'newspaper', label: 'Resources' },
];

/** Subset shown in new-user home intro chips (Notes, Scripture, Highlights, Threads). */
export const HOME_INTRO_LIST_MODES: readonly SidebarListModeEntry[] = [
  { mode: 'notes', icon: 'note-sticky', label: 'Notes' },
  { mode: 'scripture', icon: 'scroll', label: 'Scripture' },
  { mode: 'highlights', icon: 'highlighter', label: 'Highlights' },
  { mode: 'threads', icon: 'arrow-right-arrow-left', label: 'Threads' },
];
