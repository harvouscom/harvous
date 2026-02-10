import type { ThreadColor } from './common.js';

export interface Thread {
  id: string;
  title: string;
  subtitle: string | null;
  spaceId: string | null;
  color: string | null;
  isPinned: boolean;
  isPublic: boolean;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string | null;
  lastVisited: string | null;
}

export interface ThreadListItem {
  id: string;
  title: string;
  color: string | null;
  spaceId: string | null;
  noteCount: number;
  backgroundGradient: string;
}

export interface ThreadNote {
  id: string;
  title: string | null;
  content: string;
  simpleNoteId: number | null;
  noteType: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface ThreadNotesResponse {
  notes: ThreadNote[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface CreateThreadParams {
  title?: string;
  color?: ThreadColor | string;
  isPublic?: boolean;
  spaceId?: string;
  selectedNoteIds?: string[];
}

export interface CreateThreadResponse {
  success: string;
  thread: Thread;
}

export interface UpdateThreadParams {
  id: string;
  title?: string;
  color?: ThreadColor | string;
  isPublic?: boolean;
  selectedNoteIds?: string[];
}

export interface UpdateThreadResponse {
  success: string;
  thread: Thread;
}

export interface DeleteThreadResponse {
  success: string;
  threadId: string;
}
