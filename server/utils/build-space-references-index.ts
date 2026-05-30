/**
 * Aggregate URL link references across all notes in a space (prototype sidebar References mode).
 * Mirrors the scripture-index builder pattern — walks note content HTML for `data-url-link`
 * attributes, then groups results by domain.
 */

export type ReferencesIndexNoteBrief = {
  id: string;
  title: string | null;
  updatedAt: string | null;
};

export type ReferencesIndexUrl = {
  href: string;
  title: string | null;
  noteCount: number;
  notes: ReferencesIndexNoteBrief[];
};

export type ReferencesIndexDomain = {
  domain: string;
  referenceCount: number;
  noteCount: number;
  urls: ReferencesIndexUrl[];
};

export type SpaceReferencesIndexPayload = {
  domains: ReferencesIndexDomain[];
};

export type ReferencesIndexNoteRow = {
  id: string;
  title: string | null;
  content: string | null;
  updatedAt: string | null;
};

function extractDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

/** Extract all data-url-link hrefs from note HTML content. */
function extractUrlLinks(html: string): string[] {
  const out: string[] = [];
  const re = /data-url-link\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const v = m[1]?.trim();
    if (v) out.push(v);
  }
  return out;
}

/** Extract data-url-title for a given href (first occurrence wins). */
function extractUrlTitle(html: string, href: string): string | null {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `data-url-link\\s*=\\s*["']${escaped}["'][^>]*data-url-title\\s*=\\s*["']([^"']+)["']`,
    'i',
  );
  const m = re.exec(html);
  if (m?.[1]) return m[1].trim();
  // Also try reversed attribute order
  const re2 = new RegExp(
    `data-url-title\\s*=\\s*["']([^"']+)["'][^>]*data-url-link\\s*=\\s*["']${escaped}["']`,
    'i',
  );
  const m2 = re2.exec(html);
  return m2?.[1]?.trim() ?? null;
}

export function buildSpaceReferencesIndex(notes: ReferencesIndexNoteRow[]): SpaceReferencesIndexPayload {
  type MutableUrl = {
    href: string;
    title: string | null;
    noteIds: Set<string>;
    notes: Map<string, ReferencesIndexNoteBrief>;
    referenceCount: number;
  };

  type MutableDomain = {
    urls: Map<string, MutableUrl>;
    noteIds: Set<string>;
    referenceCount: number;
  };

  const domains = new Map<string, MutableDomain>();

  for (const note of notes) {
    const raw = note.content ?? '';
    const hrefs = extractUrlLinks(raw);
    for (const href of hrefs) {
      const domain = extractDomain(href);
      let domainBucket = domains.get(domain);
      if (!domainBucket) {
        domainBucket = { urls: new Map(), noteIds: new Set(), referenceCount: 0 };
        domains.set(domain, domainBucket);
      }
      domainBucket.referenceCount += 1;
      domainBucket.noteIds.add(note.id);

      let urlBucket = domainBucket.urls.get(href);
      if (!urlBucket) {
        urlBucket = {
          href,
          title: extractUrlTitle(raw, href),
          noteIds: new Set(),
          notes: new Map(),
          referenceCount: 0,
        };
        domainBucket.urls.set(href, urlBucket);
      }
      urlBucket.referenceCount += 1;
      if (!urlBucket.noteIds.has(note.id)) {
        urlBucket.noteIds.add(note.id);
        urlBucket.notes.set(note.id, {
          id: note.id,
          title: note.title,
          updatedAt: note.updatedAt,
        });
      }
    }
  }

  const result: ReferencesIndexDomain[] = [...domains.entries()]
    .sort((a, b) => b[1].referenceCount - a[1].referenceCount)
    .map(([domain, bucket]) => {
      const urls: ReferencesIndexUrl[] = [...bucket.urls.values()]
        .sort((a, b) => b.referenceCount - a.referenceCount)
        .map((u) => ({
          href: u.href,
          title: u.title,
          noteCount: u.noteIds.size,
          notes: [...u.notes.values()].sort((x, y) => {
            const ax = x.updatedAt ?? '';
            const ay = y.updatedAt ?? '';
            return ay.localeCompare(ax);
          }),
        }));
      return {
        domain,
        referenceCount: bucket.referenceCount,
        noteCount: bucket.noteIds.size,
        urls,
      };
    });

  return { domains: result };
}
