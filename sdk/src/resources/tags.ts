import type { HttpClient } from '../http.js';
import type {
  Tag,
  CreateTagParams,
  CreateTagResponse,
  DeleteTagResponse,
  AssignTagParams,
  AssignTagResponse,
  RemoveTagParams,
  RemoveTagResponse,
} from '../types/tags.js';

export class TagsResource {
  constructor(private http: HttpClient) {}

  /** Create a new tag */
  async create(params: CreateTagParams): Promise<CreateTagResponse> {
    return this.http.post<CreateTagResponse>('/api/tags/create', params);
  }

  /** List all tags */
  async list(): Promise<Tag[]> {
    return this.http.get<Tag[]>('/api/tags/list');
  }

  /** Delete a tag */
  async delete(tagId: string): Promise<DeleteTagResponse> {
    return this.http.del<DeleteTagResponse>('/api/tags/delete', { tagId });
  }

  /** Assign a tag to a note */
  async assign(params: AssignTagParams): Promise<AssignTagResponse> {
    return this.http.post<AssignTagResponse>('/api/note-tags/assign', params);
  }

  /** Remove a tag from a note */
  async remove(params: RemoveTagParams): Promise<RemoveTagResponse> {
    return this.http.post<RemoveTagResponse>('/api/note-tags/remove', params);
  }
}
