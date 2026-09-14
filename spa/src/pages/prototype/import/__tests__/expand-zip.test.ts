/**
 * Opening a dropped zip, with JSZip loaded on demand.
 *
 * The library is imported dynamically so it stays off the critical path — this
 * module also exports `formatFileSize` and `IMPORT_ACCEPT_ATTRIBUTE`, which eager
 * surfaces pull in, and a static import put all ~95 KB of JSZip in `index.js` for
 * every route including sign-in. Moving it out took 30.6 KB gzipped off that chunk.
 *
 * Worth a test precisely because the failure mode is silent to the type checker:
 * `await import('jszip')` hands back a namespace, and reading the wrong property
 * off it (`JSZip` instead of `default`) compiles and then throws only when someone
 * actually drops a zip — a path nothing else here covers.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { expandZip, formatFileSize } from '../import-file-sources';

/*
 * jsdom's `File` has no `arrayBuffer()`, which `expandZip` calls before handing the
 * bytes to JSZip. Without this the happy path cannot run at all: the call throws,
 * the function's own catch turns it into "could not be opened", and every
 * assertion below reads as a broken zip rather than a missing browser API.
 */
beforeAll(() => {
  if (typeof File.prototype.arrayBuffer === 'function') return;
  File.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
});

/** jsdom's Blob has no `text()` either, so read it the long way. */
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

async function zipFile(entries: Record<string, string>, name = 'backup.zip'): Promise<File> {
  const zip = new JSZip();
  for (const [path, body] of Object.entries(entries)) zip.file(path, body);
  const blob = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([blob], name, { type: 'application/zip' });
}

describe('expandZip', () => {
  it('loads JSZip on demand and returns one source per supported entry', async () => {
    const file = await zipFile({
      'notes/first.md': '# First\n\nbody',
      'notes/second.md': '# Second\n\nbody',
    });

    const result = await expandZip(file);

    expect(result.sources.map((s) => s.name).sort()).toEqual(['first.md', 'second.md']);
    expect(result.skipped).toEqual([]);
    // The bytes have to survive the round trip, not just the names. A source hands
    // back a File, not text — `file()`, which is what the engine calls.
    const first = result.sources.find((s) => s.name === 'first.md');
    expect(first).toBeTruthy();
    await expect(readText(await first!.file())).resolves.toContain('# First');
  });

  it('keeps the folder each entry came from', async () => {
    const file = await zipFile({ 'Sermons/2026/john.md': '# John' });
    const result = await expandZip(file);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].folderPath).toContain('Sermons');
  });

  it('reports a file it cannot open rather than throwing', async () => {
    // The dynamic import sits inside the same try as `loadAsync`, so a broken zip
    // still comes back as a skip — the caller has no catch of its own.
    const notAZip = new File([new Uint8Array([1, 2, 3, 4])], 'broken.zip');
    const result = await expandZip(notAZip);
    expect(result.sources).toEqual([]);
    expect(result.skipped.join(' ')).toContain('broken.zip');
  });

  it('still exports the helpers that kept it on the critical path', () => {
    // These are why the static import mattered: trivial, and imported by eager
    // surfaces. If they ever move out, the dynamic import above can go back.
    expect(formatFileSize(2_100_000)).toMatch(/MB/);
  });
});
