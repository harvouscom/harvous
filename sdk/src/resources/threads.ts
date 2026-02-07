import type { HttpClient } from '../http.js';
import type {
  CreateThreadParams,
  CreateThreadResponse,
  UpdateThreadParams,
  UpdateThreadResponse,
  DeleteThreadResponse,
  ThreadListItem,
  ThreadNotesResponse,
} from '../types/threads.js';

export class ThreadsResource {
  constructor(private http: HttpClient) {}

  /** Create a new thread */
  async create(params: CreateThreadParams): Promise<CreateThreadResponse> {
    const fields: Record<string, string | undefined> = {
      title: params.title,
      color: params.color,
      isPublic: params.isPublic?.toString(),
      spaceId: params.spaceId,
      selectedNoteIds: params.selectedNoteIds?.join(','),
    };
    return this.http.postFormData<CreateThreadResponse>(
      '/api/threads/create',
      fields,
    );
  }

  /** List all threads */
  async list(): Promise<ThreadListItem[]> {
    return this.http.get<ThreadListItem[]>('/api/threads/list');
  }

  /** Update a thread */
  async update(params: UpdateThreadParams): Promise<UpdateThreadResponse> {
    const fields: Record<string, string | undefined> = {
      threadId: params.id,
      title: params.title,
      color: params.color,
      isPublic: params.isPublic?.toString(),
      selectedNoteIds: params.selectedNoteIds?.join(','),
    };
    return this.http.postFormData<UpdateThreadResponse>(
      '/api/threads/update',
      fields,
    );
  }

  /** Delete a thread */
  async delete(threadId: string): Promise<DeleteThreadResponse> {
    return this.http.del<DeleteThreadResponse>('/api/threads/delete', {
      threadId,
    });
  }

  /** List notes in a thread */
  async notes(
    threadId: string,
    options?: { offset?: number; limit?: number },
  ): Promise<ThreadNotesResponse> {
    return this.http.get<ThreadNotesResponse>(
      `/api/threads/${threadId}/notes`,
      {
        offset: options?.offset,
        limit: options?.limit,
      },
    );
  }
}
