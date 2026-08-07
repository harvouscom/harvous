/**
 * Turning a drop (or a file picker) into the flat list of things we can import.
 *
 * Two jobs the browser makes awkward: walking a dropped folder, and getting inside
 * a zip. Both are done here so the engine only ever sees a plain list of sources
 * with a name, a size, a folder path, and a way to get the bytes.
 */
import JSZip from 'jszip';

/** Extensions the server will parse. Kept in step with import-session.ts. */
export const IMPORT_ACCEPT_EXTENSIONS = [
  'md', 'markdown', 'txt', 'csv', 'docx', 'html', 'htm', 'pdf', 'enex',
] as const;

/** For the file input's `accept` attribute — zips are expanded here, not sent whole. */
export const IMPORT_ACCEPT_ATTRIBUTE = [...IMPORT_ACCEPT_EXTENSIONS.map((e) => `.${e}`), '.zip'].join(',');

export const MAX_IMPORT_FILES = 200;
export const MAX_ZIP_BYTES = 100 * 1024 * 1024;

export interface ImportFileSource {
  /** Stable within a session; also sent to the server so items map back to this row. */
  id: string;
  name: string;
  size: number;
  extension: string;
  /** Directory path, from a folder drop or from inside a zip. Becomes the note's folder. */
  folderPath: string | null;
  /** Full path used to de-duplicate the same file arriving twice. */
  path: string;
  /** Which zip this came out of, for grouping in the UI. */
  fromArchive: string | null;
  file: () => Promise<File>;
}

export interface CollectedImportFiles {
  sources: ImportFileSource[];
  /** Connection graph recovered from a Harvous backup's manifest.json. */
  manifestConnections: Array<{ fromNoteId: string; toNoteId: string }>;
  /** Things we deliberately did not take, phrased for the user. */
  skipped: string[];
}

export function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function isSupportedImportFile(name: string): boolean {
  return (IMPORT_ACCEPT_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** Hidden files, macOS resource forks, and Harvous's own sidecar directory. */
function isIgnorablePath(path: string): boolean {
  const segments = path.split('/');
  const base = segments[segments.length - 1] || path;
  if (base.startsWith('.')) return true;
  return segments.some((seg) => seg === '__MACOSX' || seg === '_harvous');
}

function folderPathOf(path: string): string | null {
  const parts = path.split('/');
  if (parts.length <= 1) return null;
  const dir = parts.slice(0, -1).join('/');
  return dir || null;
}

function makeId(): string {
  return `impfile_${crypto.randomUUID()}`;
}

function sourceFromFile(file: File, path: string, fromArchive: string | null): ImportFileSource {
  return {
    id: makeId(),
    name: file.name || path.split('/').pop() || 'import',
    size: file.size,
    extension: extensionOf(file.name || path),
    folderPath: folderPathOf(path),
    path,
    fromArchive,
    file: async () => file,
  };
}

/**
 * `readEntries` returns at most 100 entries per call and signals the end with an
 * empty batch — call it once and a 400-file folder quietly becomes a 100-file one.
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        },
        () => resolve(all),
      );
    };
    readBatch();
  });
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

async function walkEntry(entry: FileSystemEntry, out: Array<{ file: File; path: string }>): Promise<void> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    // fullPath starts with '/', which would read as a leading empty folder segment.
    if (file) out.push({ file, path: (entry.fullPath || `/${entry.name}`).replace(/^\//, '') });
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    for (const child of children) await walkEntry(child, out);
  }
}

/** Expand a Harvous backup (or any zip of notes) into individually trackable entries. */
export async function expandZip(file: File): Promise<{
  sources: ImportFileSource[];
  manifestConnections: Array<{ fromNoteId: string; toNoteId: string }>;
  skipped: string[];
}> {
  const skipped: string[] = [];
  if (file.size > MAX_ZIP_BYTES) {
    return { sources: [], manifestConnections: [], skipped: [`${file.name} is too large to open here.`] };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    return { sources: [], manifestConnections: [], skipped: [`${file.name} could not be opened.`] };
  }

  const sources: ImportFileSource[] = [];
  const manifestConnections: Array<{ fromNoteId: string; toNoteId: string }> = [];
  let unsupportedCount = 0;

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const path = entry.name;
    const base = path.split('/').pop() || path;

    if (base === 'manifest.json') {
      try {
        const manifest = JSON.parse(await entry.async('string')) as {
          connections?: Array<{ fromNoteId?: string; toNoteId?: string }>;
        };
        for (const conn of manifest.connections ?? []) {
          if (conn.fromNoteId && conn.toNoteId) {
            manifestConnections.push({ fromNoteId: conn.fromNoteId, toNoteId: conn.toNoteId });
          }
        }
      } catch {
        skipped.push(`${file.name}: the backup manifest could not be read, so links may not restore.`);
      }
      continue;
    }

    if (isIgnorablePath(path)) continue;
    if (!isSupportedImportFile(base)) {
      unsupportedCount++;
      continue;
    }

    const blob = await entry.async('blob');
    const inner = new File([blob], base, { type: blob.type });
    sources.push({
      id: makeId(),
      name: base,
      size: inner.size,
      extension: extensionOf(base),
      folderPath: folderPathOf(path),
      path: `${file.name}/${path}`,
      fromArchive: file.name,
      file: async () => inner,
    });
  }

  if (unsupportedCount > 0) {
    skipped.push(
      `${file.name}: skipped ${unsupportedCount} file${unsupportedCount === 1 ? '' : 's'} we can't read.`,
    );
  }
  return { sources, manifestConnections, skipped };
}

async function collect(
  raw: Array<{ file: File; path: string }>,
  existingPaths: Set<string>,
): Promise<CollectedImportFiles> {
  const sources: ImportFileSource[] = [];
  const manifestConnections: Array<{ fromNoteId: string; toNoteId: string }> = [];
  const skipped: string[] = [];
  const seen = new Set(existingPaths);
  let unsupported = 0;

  for (const { file, path } of raw) {
    if (isIgnorablePath(path)) continue;

    if (extensionOf(file.name) === 'zip') {
      const expanded = await expandZip(file);
      manifestConnections.push(...expanded.manifestConnections);
      skipped.push(...expanded.skipped);
      for (const source of expanded.sources) {
        if (seen.has(source.path)) continue;
        seen.add(source.path);
        sources.push(source);
      }
      continue;
    }

    if (!isSupportedImportFile(file.name)) {
      unsupported++;
      continue;
    }
    if (seen.has(path)) continue;
    seen.add(path);
    sources.push(sourceFromFile(file, path, null));
  }

  if (unsupported > 0) {
    skipped.push(`Skipped ${unsupported} file${unsupported === 1 ? '' : 's'} in a format we can't read yet.`);
  }
  return { sources, manifestConnections, skipped };
}

/**
 * Read a drop. Uses the entries API when the browser offers it (the only way to see
 * inside a dropped folder) and falls back to the flat file list otherwise.
 */
export async function collectFromDataTransfer(
  dataTransfer: DataTransfer,
  existingPaths: Set<string> = new Set(),
): Promise<CollectedImportFiles> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === 'file')
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entry): entry is FileSystemEntry => entry != null);

  if (entries.length === 0) {
    return collectFromFileList(dataTransfer.files, existingPaths);
  }

  const raw: Array<{ file: File; path: string }> = [];
  for (const entry of entries) await walkEntry(entry, raw);
  return collect(raw, existingPaths);
}

/** Read a file/folder picker selection. `webkitRelativePath` carries folder structure. */
export async function collectFromFileList(
  fileList: FileList | null,
  existingPaths: Set<string> = new Set(),
): Promise<CollectedImportFiles> {
  const raw = Array.from(fileList ?? []).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
  return collect(raw, existingPaths);
}

/** Smallest first, so the first rows finish while the big ones are still going. */
export function sortSmallestFirst(sources: ImportFileSource[]): ImportFileSource[] {
  return [...sources].sort((a, b) => a.size - b.size);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
