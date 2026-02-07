import type { HttpClient } from '../http.js';
import type {
  CreateNoteParams,
  CreateNoteResponse,
  UpdateNoteContentParams,
  UpdateNoteContentResponse,
  DeleteNoteResponse,
  NoteDetails,
  RecentNote,
  NextIdResponse,
} from '../types/notes.js';

export class NotesResource {
  constructor(private http: HttpClient) {}

  /** Create a new note */
  async create(params: CreateNoteParams): Promise<CreateNoteResponse> {
    const fields: Record<string, string | undefined> = {
      content: params.content,
      title: params.title,
      threadId: params.threadId,
      noteType: params.noteType,
      spaceId: params.spaceId,
      scriptureReference: params.scriptureReference,
      scriptureVersion: params.scriptureVersion,
      resourceUrl: params.resourceUrl,
      contentEncrypted: params.contentEncrypted?.toString(),
    };
    return this.http.postFormData<CreateNoteResponse>(
      '/api/notes/create',
      fields,
    );
  }

  /** Get note details by ID */
  async get(noteId: string): Promise<NoteDetails> {
    return this.http.get<NoteDetails>(`/api/notes/${noteId}/details`);
  }

  /** List recent notes */
  async recent(limit?: number): Promise<RecentNote[]> {
    return this.http.get<RecentNote[]>('/api/notes/recent', { limit });
  }

  /** Update note content */
  async updateContent(
    noteId: string,
    params: UpdateNoteContentParams,
  ): Promise<UpdateNoteContentResponse> {
    return this.http.post<UpdateNoteContentResponse>(
      `/api/notes/${noteId}/update-content`,
      params,
    );
  }

  /** Delete a note */
  async delete(noteId: string): Promise<DeleteNoteResponse> {
    return this.http.del<DeleteNoteResponse>('/api/notes/delete', { noteId });
  }

  /** Get the next sequential note ID */
  async nextId(): Promise<NextIdResponse> {
    return this.http.get<NextIdResponse>('/api/notes/next-id');
  }
}
