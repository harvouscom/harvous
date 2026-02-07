import type { HttpClient } from '../http.js';
import type {
  CreateSpaceParams,
  CreateSpaceResponse,
  DeleteSpaceResponse,
  AddItemsParams,
  AddItemsResponse,
  RemoveItemsParams,
  RemoveItemsResponse,
} from '../types/spaces.js';

export class SpacesResource {
  constructor(private http: HttpClient) {}

  /** Create a new space */
  async create(params: CreateSpaceParams): Promise<CreateSpaceResponse> {
    const fields: Record<string, string | undefined> = {
      title: params.title,
      color: params.color,
      isPublic: params.isPublic?.toString(),
      selectedNoteIds: params.selectedNoteIds?.join(','),
      selectedThreadIds: params.selectedThreadIds?.join(','),
    };
    return this.http.postFormData<CreateSpaceResponse>(
      '/api/spaces/create',
      fields,
    );
  }

  /** Delete a space */
  async delete(spaceId: string): Promise<DeleteSpaceResponse> {
    return this.http.del<DeleteSpaceResponse>('/api/spaces/delete', {
      spaceId,
    });
  }

  /** Get notes in a space */
  async notes(spaceId: string): Promise<unknown> {
    return this.http.get(`/api/spaces/${spaceId}/notes`);
  }

  /** Add items (notes and/or threads) to a space */
  async addItems(
    spaceId: string,
    params: AddItemsParams,
  ): Promise<AddItemsResponse> {
    return this.http.post<AddItemsResponse>(
      `/api/spaces/${spaceId}/add-items`,
      params,
    );
  }

  /** Remove items (notes and/or threads) from a space */
  async removeItems(
    spaceId: string,
    params: RemoveItemsParams,
  ): Promise<RemoveItemsResponse> {
    return this.http.post<RemoveItemsResponse>(
      `/api/spaces/${spaceId}/remove-items`,
      params,
    );
  }
}
