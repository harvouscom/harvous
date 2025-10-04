export interface CreateNoteRequest {
  content: string;
  title?: string;
  threadId?: string;
  spaceId?: string;
  isPublic?: boolean;
}

export interface UpdateNoteRequest {
  content?: string;
  title?: string;
  threadId?: string;
  spaceId?: string;
  isPublic?: boolean;
}

export interface CreateThreadRequest {
  title: string;
  subtitle?: string;
  spaceId?: string;
  color?: string;
  isPublic?: boolean;
}

export interface CreateSpaceRequest {
  title: string;
  description?: string;
  color?: string;
  isPublic?: boolean;
}
