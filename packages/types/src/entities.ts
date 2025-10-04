export interface Note {
  id: string;
  title?: string;
  content: string;
  threadId: string;
  spaceId?: string;
  simpleNoteId?: number;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  isPublic: boolean;
  isFeatured: boolean;
  order: number;
}

export interface Thread {
  id: string;
  title: string;
  subtitle?: string;
  spaceId?: string;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  isPublic: boolean;
  isPinned: boolean;
  color?: string;
  order: number;
  noteCount?: number;
}

export interface Space {
  id: string;
  title: string;
  description?: string;
  color?: string;
  backgroundGradient?: string;
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  isPublic: boolean;
  isActive: boolean;
  order: number;
  totalItemCount?: number;
}

export interface NavigationItem {
  id: string;
  title: string;
  type: 'thread' | 'space' | 'note';
  count: number;
  backgroundGradient: string;
  color: string;
  firstAccessed: number;
  lastAccessed: number;
}
