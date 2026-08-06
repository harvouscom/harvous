/**
 * Display label for where a library resource points.
 *
 * Prefers the bare domain over the stored `sourceSiteName`. That name is only a
 * real publisher name when the page served `og:site_name`; otherwise the
 * metadata endpoint derives it from the host, which mangles subdomains
 * ("en.wikipedia.org" becomes "En Wikipedia"). The domain is never mangled and
 * is the more useful signal anyway — it says exactly what will open.
 */
export function resourceSourceLabel(
  domain?: string | null,
  siteName?: string | null,
): string {
  const host = (domain ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (host) return host;
  return (siteName ?? '').trim();
}

const MIME_SHORT_NAMES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'text/plain': 'TXT',
  'text/markdown': 'MD',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'audio/mpeg': 'MP3',
  'audio/mp4': 'M4A',
  'audio/x-m4a': 'M4A',
};

export function formatResourceFileBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/**
 * Label for where a file resource "goes" — its type and weight ("PDF · 2.1 MB"),
 * the file counterpart of the link items' domain. Falls back to the filename
 * extension when the mime type is unknown.
 */
export function resourceFileLabel(
  fileMime?: string | null,
  fileBytes?: number | null,
  fileName?: string | null,
): string {
  const mime = (fileMime ?? '').trim().toLowerCase();
  let kind = MIME_SHORT_NAMES[mime] ?? '';
  if (!kind) {
    const ext = (fileName ?? '').split('.').pop() ?? '';
    if (ext && ext.length <= 5 && ext !== fileName) kind = ext.toUpperCase();
  }
  const size = formatResourceFileBytes(fileBytes);
  if (kind && size) return `${kind} · ${size}`;
  return kind || size || 'File';
}
