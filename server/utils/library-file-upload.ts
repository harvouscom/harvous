/**
 * Library file storage — private `library-files` Supabase bucket.
 *
 * Deliberately not `note-attachments`: that bucket is public and its RLS is
 * shaped for inline note images. Library files are reachable only through
 * short-lived signed URLs minted after the owner check in the route, so the
 * bucket stays private and the permission model stays in one place
 * (docs/future/RESOURCE_LIBRARY.md §8).
 *
 * Files are stored as-is (no sharp pass) — a PDF or a doc must survive
 * byte-for-byte. The cap follows PCO's ~50MB precedent; large media stays a
 * link.
 */

import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const LIBRARY_FILES_BUCKET = 'library-files';

export const LIBRARY_FILE_MAX_BYTES = 50 * 1024 * 1024;

/** How long a mint-on-open link stays valid. Long enough to open, not to share. */
export const LIBRARY_FILE_SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Pragmatic study-material allowlist: documents, images, audio. No video —
 * that's what links are for (PCO parity, RESOURCE_LIBRARY.md §13).
 */
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
]);

let adminClient: SupabaseClient | null = null;

export function isLibraryFileStorageConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return Boolean(url && key);
}

function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export function isAllowedLibraryFileMime(mimeType: string): boolean {
  return ALLOWED_MIME.has(mimeType.split(';')[0].trim().toLowerCase());
}

/** Keep the original extension for download names; drop everything risky. */
export function sanitizeLibraryFileName(name: string): string {
  const trimmed = name.trim().replace(/[/\\]/g, '_');
  const cleaned = trimmed.replace(/[^\w.\- ()]/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'file').slice(0, 140);
}

export type UploadLibraryFileResult =
  | { ok: true; storageKey: string }
  | { ok: false; status: 400 | 413 | 503; error: string };

export async function uploadLibraryFile(params: {
  userId: string;
  itemId: string;
  fileName: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<UploadLibraryFileResult> {
  const { userId, itemId, fileName, bytes, mimeType } = params;

  if (!isLibraryFileStorageConfigured()) {
    return { ok: false, status: 503, error: 'File storage is not configured' };
  }

  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(normalizedMime)) {
    return { ok: false, status: 400, error: 'Unsupported file type' };
  }

  if (bytes.length === 0) {
    return { ok: false, status: 400, error: 'File is empty' };
  }
  if (bytes.length > LIBRARY_FILE_MAX_BYTES) {
    return { ok: false, status: 413, error: 'File is larger than 50MB — link to it instead' };
  }

  const client = getAdminClient();
  if (!client) {
    return { ok: false, status: 503, error: 'File storage is not configured' };
  }

  // userId prefix keeps per-owner objects grouped; the UUID beats name clashes.
  const objectName = `${userId}/${itemId}/${randomUUID()}-${sanitizeLibraryFileName(fileName)}`;
  const { error } = await client.storage.from(LIBRARY_FILES_BUCKET).upload(objectName, bytes, {
    contentType: normalizedMime,
    upsert: false,
  });

  if (error) {
    console.error('[library-file-upload] storage upload failed:', error.message);
    return { ok: false, status: 503, error: 'Failed to upload file' };
  }

  return { ok: true, storageKey: objectName };
}

/**
 * Mint a short-lived download URL. Callers MUST have already verified the
 * requester owns the item — this function trusts its input.
 */
export async function signedLibraryFileUrl(storageKey: string): Promise<string | null> {
  const client = getAdminClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(LIBRARY_FILES_BUCKET)
    .createSignedUrl(storageKey, LIBRARY_FILE_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error('[library-file-upload] sign failed:', error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function deleteLibraryFile(storageKey: string): Promise<void> {
  const client = getAdminClient();
  if (!client) return;
  const { error } = await client.storage.from(LIBRARY_FILES_BUCKET).remove([storageKey]);
  if (error) console.error('[library-file-upload] delete failed:', error.message);
}
