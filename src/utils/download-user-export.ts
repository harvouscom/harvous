/**
 * Authenticated user export download — Profile → My Data and prototype settings.
 *
 * Uses a hidden iframe so Clerk session cookies reach GET /api/user/export and the
 * server's Content-Disposition drives the download without blob URLs or lost gestures.
 */

export type UserExportFormat = 'csv-threads' | 'markdown' | 'text';

const VALID_EXPORT_CONTENT_TYPES = ['text/csv', 'text/markdown', 'text/plain'] as const;

const IFRAME_CLEANUP_MS = 60_000;

function resolveApiBaseUrl(baseUrl?: string): string {
  if (baseUrl !== undefined) return baseUrl;
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
    return String(import.meta.env.VITE_API_BASE_URL);
  }
  return '';
}

export function buildUserExportUrl(format: UserExportFormat, baseUrl?: string): string {
  const path = `/api/user/export?format=${encodeURIComponent(format)}`;
  return `${resolveApiBaseUrl(baseUrl)}${path}`;
}

export function validateExportResponse(response: Response): void {
  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText || String(response.status)}`);
  }

  const contentType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType === 'text/html' || contentType === 'application/json') {
    throw new Error('Export returned an unexpected response type');
  }

  if (
    contentType !== '' &&
    !VALID_EXPORT_CONTENT_TYPES.some((allowed) => contentType === allowed)
  ) {
    throw new Error('Export returned an unexpected content type');
  }
}

export function parseExportFilename(response: Response, format: UserExportFormat): string {
  const contentDisposition = response.headers.get('Content-Disposition');
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) return match[1];
  }

  const date = new Date().toISOString().split('T')[0];
  const ext = format === 'csv-threads' ? 'csv' : format === 'markdown' ? 'md' : 'txt';
  return `harvous-export-${date}.${ext}`;
}

/** Start download synchronously (call from a click handler before any await). */
export function triggerAuthenticatedExportDownload(format: UserExportFormat, baseUrl?: string): void {
  const url = buildUserExportUrl(format, baseUrl);
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = url;
  document.body.appendChild(iframe);
  window.setTimeout(() => {
    iframe.remove();
  }, IFRAME_CLEANUP_MS);
}

export async function fetchAndValidateUserExport(
  format: UserExportFormat,
  baseUrl?: string,
): Promise<{ response: Response; filename: string }> {
  const url = buildUserExportUrl(format, baseUrl);
  const response = await fetch(url, { method: 'GET', credentials: 'include' });
  validateExportResponse(response);
  const filename = parseExportFilename(response, format);
  return { response, filename };
}

/**
 * Download the full backup (.zip). The text/iframe path can't handle binary, so
 * fetch the zip as a blob (sending Clerk cookies) and save it via an object URL.
 */
export async function downloadUserBackupZip(baseUrl?: string): Promise<string> {
  const url = `${resolveApiBaseUrl(baseUrl)}/api/user/export?format=backup`;
  const response = await fetch(url, { method: 'GET', credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Backup failed: ${response.statusText || String(response.status)}`);
  }
  const contentType = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType && contentType !== 'application/zip' && contentType !== 'application/octet-stream') {
    throw new Error('Backup returned an unexpected content type');
  }
  const date = new Date().toISOString().split('T')[0];
  const filename = parseExportFilename(response, 'markdown').replace(/harvous-export-.*$/, `harvous-backup-${date}.zip`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), IFRAME_CLEANUP_MS);
  return filename;
}
