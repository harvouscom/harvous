/**
 * Inline note body images — resize with sharp, upload to Supabase Storage `note-attachments`.
 */

import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

async function loadSharp() {
  const { default: sharp } = await import('sharp');
  return sharp;
}

export const NOTE_ATTACHMENTS_BUCKET = 'note-attachments';

/** Max bytes accepted before processing (pre-sharp). */
export const NOTE_INLINE_IMAGE_MAX_RAW_BYTES = 10 * 1024 * 1024;

/** Target cap after JPEG encode (matches native NoteInlineImageSerialization). */
export const NOTE_INLINE_IMAGE_MAX_OUTPUT_BYTES = 500_000;

export const NOTE_INLINE_IMAGE_MAX_WIDTH = 400;

const JPEG_QUALITY = 82;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

let adminClient: SupabaseClient | null = null;

export function isNoteInlineImageStorageConfigured(): boolean {
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

export function publicNoteAttachmentUrl(storagePath: string): string {
  const base = process.env.SUPABASE_URL?.trim().replace(/\/$/, '') ?? '';
  return `${base}/storage/v1/object/public/${NOTE_ATTACHMENTS_BUCKET}/${storagePath}`;
}

/**
 * Downscale and JPEG-encode; iteratively lower quality if still over max output size.
 */
export async function prepareInlineNoteImageJpeg(input: Buffer): Promise<Buffer> {
  let quality = JPEG_QUALITY;
  let last: Buffer | null = null;

  const sharp = await loadSharp();

  for (let attempt = 0; attempt < 6; attempt++) {
    const out = await sharp(input)
      .rotate()
      .resize({
        width: NOTE_INLINE_IMAGE_MAX_WIDTH,
        height: NOTE_INLINE_IMAGE_MAX_WIDTH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    last = out;
    if (out.length <= NOTE_INLINE_IMAGE_MAX_OUTPUT_BYTES) return out;
    quality = Math.max(40, quality - 10);
  }

  if (last && last.length <= NOTE_INLINE_IMAGE_MAX_OUTPUT_BYTES) return last;
  throw new Error('Image is too large after compression');
}

export type UploadInlineNoteImageResult =
  | { ok: true; url: string; path: string }
  | { ok: false; status: 400 | 413 | 503; error: string };

export async function uploadInlineNoteImage(params: {
  userId: string;
  noteId: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<UploadInlineNoteImageResult> {
  const { userId, noteId, bytes, mimeType } = params;

  if (!isNoteInlineImageStorageConfigured()) {
    return { ok: false, status: 503, error: 'Image storage is not configured' };
  }

  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME.has(normalizedMime)) {
    return { ok: false, status: 400, error: 'Unsupported image type' };
  }

  if (bytes.length > NOTE_INLINE_IMAGE_MAX_RAW_BYTES) {
    return { ok: false, status: 413, error: 'Image file is too large' };
  }

  let jpeg: Buffer;
  try {
    jpeg = await prepareInlineNoteImageJpeg(bytes);
  } catch {
    return { ok: false, status: 400, error: 'Could not process image' };
  }

  const client = getAdminClient();
  if (!client) {
    return { ok: false, status: 503, error: 'Image storage is not configured' };
  }

  const objectName = `${userId}/${noteId}/${randomUUID()}.jpg`;
  const { error } = await client.storage.from(NOTE_ATTACHMENTS_BUCKET).upload(objectName, jpeg, {
    contentType: 'image/jpeg',
    upsert: false,
  });

  if (error) {
    console.error('[note-inline-image-upload] storage upload failed:', error.message);
    return { ok: false, status: 503, error: 'Failed to upload image' };
  }

  return { ok: true, url: publicNoteAttachmentUrl(objectName), path: objectName };
}

export function isAllowedInlineImageMime(mimeType: string): boolean {
  return ALLOWED_MIME.has(mimeType.split(';')[0].trim().toLowerCase());
}
