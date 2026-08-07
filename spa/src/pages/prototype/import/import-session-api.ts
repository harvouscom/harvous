/**
 * Typed client for the import session endpoints.
 *
 * File uploads go through XMLHttpRequest rather than the shared `api` helper for one
 * reason: fetch still can't report upload progress, and a row that shows a real
 * percentage while a 12MB Word file goes up is the whole point of the surface.
 */
import { api, apiUrl, getClerkBearerToken, APIError } from '../../../lib/api';

export interface ImportItemSummary {
  itemId: string;
  clientFileId: string | null;
  fileName: string;
  title: string;
  folderPath: string | null;
  primaryCollection: string | null;
  highlightCount: number;
  tagCount: number;
  sourceType: string;
  status: string;
  duplicateHint: string | null;
  resultNoteId: string | null;
  enriched: boolean;
  error: string | null;
}

export interface ImportSessionSummary {
  sessionId: string;
  status: string;
  notesImported: number;
  threadsCreated: number;
  tagsCreated: number;
  duplicatesSkipped: number;
  highlightsImported: number;
  connectionsImported: number;
  scriptureProcessed: number;
  autoTagsApplied: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  expiresAt: string;
  limits: {
    maxFileBytes: number;
    maxFiles: number;
    maxItems: number;
    maxCommitBatch: number;
    maxEnrichBatch: number;
  };
}

export interface UploadFileResponse {
  items: ImportItemSummary[];
  warnings: string[];
  unsupported: string[];
}

export interface CommitResponse {
  results: Array<{
    itemId: string;
    status: 'committed' | 'duplicate' | 'failed';
    noteId?: string;
    highlightsImported?: number;
    error?: string;
  }>;
  rateLimited?: { retryAfterSeconds: number; message: string };
}

export interface EnrichResponse {
  results: Array<{
    itemId: string;
    autoTagsApplied: number;
    scriptureProcessed: number;
    skipped?: string;
  }>;
}

export interface FinalizeResponse {
  summary: ImportSessionSummary;
  items: ImportItemSummary[];
}

export function createImportSession(): Promise<CreateSessionResponse> {
  return api.post<CreateSessionResponse>('/api/user/import/session');
}

export function getImportSession(sessionId: string): Promise<{
  summary: ImportSessionSummary;
  expiresAt: string;
  items: ImportItemSummary[];
}> {
  return api.get(`/api/user/import/session/${sessionId}`);
}

export function postImportManifest(
  sessionId: string,
  connections: Array<{ fromNoteId: string; toNoteId: string }>,
): Promise<{ connections: number }> {
  return api.post(`/api/user/import/session/${sessionId}/manifest`, { connections });
}

export function setImportItemsIncluded(
  sessionId: string,
  itemIds: string[],
  included: boolean,
): Promise<{ success: boolean }> {
  return api.post(`/api/user/import/session/${sessionId}/exclude`, { itemIds, included });
}

export function commitImportItems(sessionId: string, itemIds: string[]): Promise<CommitResponse> {
  return api.post<CommitResponse>(`/api/user/import/session/${sessionId}/commit`, { itemIds });
}

export function enrichImportItems(sessionId: string, itemIds: string[]): Promise<EnrichResponse> {
  return api.post<EnrichResponse>(`/api/user/import/session/${sessionId}/enrich`, { itemIds });
}

export function finalizeImportSession(sessionId: string): Promise<FinalizeResponse> {
  return api.post<FinalizeResponse>(`/api/user/import/session/${sessionId}/finalize`);
}

export function discardImportSession(
  sessionId: string,
): Promise<{ success: boolean; undone: boolean; deletedNotes?: number; keptEditedNotes?: number }> {
  return api.delete(`/api/user/import/session/${sessionId}`);
}

export interface UploadOptions {
  sessionId: string;
  clientFileId: string;
  folderPath: string | null;
  file: File;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export async function uploadImportFile(options: UploadOptions): Promise<UploadFileResponse> {
  const token = await getClerkBearerToken();
  const form = new FormData();
  form.append('file', options.file, options.file.name);
  form.append('clientFileId', options.clientFileId);
  if (options.folderPath) form.append('folderPath', options.folderPath);

  return new Promise<UploadFileResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(`/api/user/import/session/${options.sessionId}/files`));
    xhr.withCredentials = true;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      options.onProgress?.(event.total > 0 ? event.loaded / event.total : 0);
    };

    xhr.onload = () => {
      let body: (UploadFileResponse & { error?: string }) | undefined;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        resolve(body);
        return;
      }
      reject(new APIError(xhr.status, body?.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new APIError(0, 'Network error while uploading'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    if (options.signal) {
      if (options.signal.aborted) {
        xhr.abort();
        return;
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(form);
  });
}
