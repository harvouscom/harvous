import type { HttpClient } from '../http.js';
import type { SearchParams, SearchResponse } from '../types/search.js';

export class SearchResource {
  constructor(private http: HttpClient) {}

  /** Search notes and threads */
  async query(params: SearchParams): Promise<SearchResponse> {
    return this.http.get<SearchResponse>('/api/search', {
      q: params.q,
      type: params.type,
      limit: params.limit,
    });
  }
}
