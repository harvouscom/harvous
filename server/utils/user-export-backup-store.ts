/**
 * Nightly user-export backup storage — private `user-exports` Supabase bucket.
 *
 * Replaces @netlify/blobs, which only has a context to run in inside a Netlify
 * Function. Same three operations the blob store was used for (set / list /
 * delete), so the calling route keeps its shape.
 *
 * Follows the pattern in library-file-upload.ts: service-role client, private
 * bucket, no RLS reliance — these objects are never served to users, only
 * written by the cron job and pruned by retention.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const USER_EXPORTS_BUCKET = 'user-exports';

/** Supabase list() paginates; exports are one object per user per day. */
const LIST_PAGE_SIZE = 1000;

let adminClient: SupabaseClient | null = null;

export function isUserExportBackupConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
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

function requireClient(): SupabaseClient {
  const client = getAdminClient();
  if (!client) throw new Error('User export backup storage is not configured');
  return client;
}

/** Write one export. Overwrites a same-day rerun rather than erroring. */
export async function putUserExport(
  key: string,
  content: string,
  contentType = 'text/csv',
): Promise<void> {
  const { error } = await requireClient()
    .storage.from(USER_EXPORTS_BUCKET)
    .upload(key, content, { contentType, upsert: true });
  if (error) throw new Error(`upload ${key} failed: ${error.message}`);
}

/**
 * All object keys in the bucket, as `<userId>/<date>.<ext>`.
 *
 * Supabase list() is per-prefix and does not recurse, so this walks the user
 * folders — unlike the blob store's flat list().
 */
export async function listUserExportKeys(): Promise<string[]> {
  const client = requireClient();
  const store = client.storage.from(USER_EXPORTS_BUCKET);

  const { data: folders, error: foldersError } = await store.list('', { limit: LIST_PAGE_SIZE });
  if (foldersError) throw new Error(`list failed: ${foldersError.message}`);

  const keys: string[] = [];
  for (const folder of folders ?? []) {
    // Supabase reports folders as entries with no id; real objects have one.
    if (folder.id) continue;
    const { data: files, error } = await store.list(folder.name, { limit: LIST_PAGE_SIZE });
    if (error) throw new Error(`list ${folder.name} failed: ${error.message}`);
    for (const file of files ?? []) {
      if (file.id) keys.push(`${folder.name}/${file.name}`);
    }
  }
  return keys;
}

export async function deleteUserExports(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { error } = await requireClient().storage.from(USER_EXPORTS_BUCKET).remove(keys);
  if (error) throw new Error(`delete failed: ${error.message}`);
}
