import type { HttpClient } from '../http.js';
import type {
  ScriptureDetection,
  FetchVerseResponse,
  CheckExistingParams,
  CheckExistingResponse,
} from '../types/scripture.js';

export class ScriptureResource {
  constructor(private http: HttpClient) {}

  /** Detect scripture references in text */
  async detect(text: string): Promise<ScriptureDetection> {
    return this.http.post<ScriptureDetection>('/api/scripture/detect', {
      text,
    });
  }

  /** Fetch verse text by reference */
  async fetchVerse(reference: string): Promise<FetchVerseResponse> {
    return this.http.post<FetchVerseResponse>('/api/scripture/fetch-verse', {
      reference,
    });
  }

  /** Check if a scripture note already exists */
  async checkExisting(
    params: CheckExistingParams,
  ): Promise<CheckExistingResponse> {
    return this.http.post<CheckExistingResponse>(
      '/api/scripture/check-existing',
      params,
    );
  }
}
