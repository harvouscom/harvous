export interface SearchParams {
  q: string;
  type?: 'all' | 'notes' | 'threads';
  limit?: number;
}

export interface SearchResult {
  id: string;
  type: 'note' | 'thread';
  title: string;
  content?: string;
  subtitle?: string;
  contentEncrypted?: boolean;
  threadId?: string;
  spaceId?: string | null;
  color?: string | null;
  lastUpdated: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  type: string;
  total: number;
}
