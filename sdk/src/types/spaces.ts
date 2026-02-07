export interface Space {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  backgroundGradient: string | null;
  isPublic: boolean;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface CreateSpaceParams {
  title: string;
  color?: string;
  isPublic?: boolean;
  selectedNoteIds?: string[];
  selectedThreadIds?: string[];
}

export interface CreateSpaceResponse {
  success: string;
  space: Space;
  addedNotes: number;
  addedThreads: number;
}

export interface DeleteSpaceResponse {
  success: string;
  spaceId: string;
}

export interface AddItemsParams {
  noteIds?: string[];
  threadIds?: string[];
}

export interface AddItemsResponse {
  success: boolean;
  message: string;
  updatedNotes: string[];
  updatedThreads: string[];
  errors?: string[];
}

export interface RemoveItemsParams {
  noteIds?: string[];
  threadIds?: string[];
}

export interface RemoveItemsResponse {
  success: boolean;
  message: string;
  removedNotes: string[];
  removedThreads: string[];
  errors?: string[];
}
