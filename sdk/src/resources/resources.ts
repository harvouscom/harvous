import type { HttpClient } from '../http.js';
import type {
  ResourceMetadataResponse,
  CheckDuplicateResponse,
} from '../types/resources.js';

export class ResourcesResource {
  constructor(private http: HttpClient) {}

  /** Fetch metadata for a URL (title, description, image, etc.) */
  async metadata(url: string): Promise<ResourceMetadataResponse> {
    return this.http.post<ResourceMetadataResponse>('/api/resource/metadata', {
      url,
    });
  }

  /** Check if a resource URL already exists as a note */
  async checkDuplicate(url: string): Promise<CheckDuplicateResponse> {
    return this.http.post<CheckDuplicateResponse>(
      '/api/resource/check-duplicate',
      { url },
    );
  }
}
