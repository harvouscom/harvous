export interface ResourceMetadata {
  title: string;
  description: string;
  image: string;
  url: string;
  siteName: string | null;
  contentType?: string;
  articleContent?: string;
}

export interface ResourceMetadataResponse {
  success: boolean;
  metadata: ResourceMetadata;
}

export interface CheckDuplicateResponse {
  exists: boolean;
  noteId?: string;
  simpleNoteId?: number | null;
  title?: string;
  description?: string | null;
  image?: string | null;
  url?: string;
}
