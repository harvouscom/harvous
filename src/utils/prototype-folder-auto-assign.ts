/**
 * Prototype primary-folder assignment — full title+body after edit idle.
 * Typing and paste share this path so the same final content yields the same folder.
 */

import {
  applyAutoCollectionAfterEdit,
  type CollectionChromeState,
} from '@/utils/bible-study-collection-web';
import { stripHtml } from '@/utils/html-stripper';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import { contentSubjects } from '@/utils/subject-vocabulary';
import { conceptOverlaps } from '@/utils/bible-study-concept-overlaps';
import { detectScriptureReferences, parseScriptureReference } from '@/utils/scripture-detector';
import chapterSubjectsData from '@/data/chapter-subjects.json';

const chapterSubjects = chapterSubjectsData as Record<string, Record<string, string[]>>;
const MAX_SUBJECT_SECONDARIES = 3; // matches MAX_AUTO_SECONDARIES in the keyword system
const MAX_PASSAGE_SUBJECTS = 2; // cited-chapter subjects only fill gaps

/** Plain body for folder snapshots — matches `buildRowsForCollectionSuggest` stripping. */
export function plainBodyForFolderSnapshot(html: string): string {
  return stripHtml(html || '', { preserveSpacing: true }).trim();
}

/** Body text is required for auto primary folder assignment. */
export function hasAutoFolderBodyContent(bodyHtml: string): boolean {
  return plainBodyForFolderSnapshot(bodyHtml).length > 0;
}

/** Clear auto-assigned folder chrome; pinned primary is preserved. */
export function clearAutoFolderChrome(prev: CollectionChromeState): CollectionChromeState {
  if (prev.collectionUserOverride && !prev.collectionPinned) return prev;
  if (prev.collectionPinned) {
    return {
      ...prev,
      secondaryCollections: [],
    };
  }
  return {
    ...prev,
    primaryCollection: null,
    secondaryCollections: [],
    collectionLastAutoUpdatedAtIso: null,
  };
}

/** Distinct (book, chapter) the text cites, for looking up curated chapter subjects. */
function citedChapters(text: string): Array<{ book: string; chapter: number }> {
  const out: Array<{ book: string; chapter: number }> = [];
  const seen = new Set<string>();
  for (const ref of detectScriptureReferences(text)) {
    const parsed = parseScriptureReference(ref.reference);
    if (!parsed) continue;
    const key = `${parsed.book}|${parsed.chapter}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ book: parsed.book, chapter: parsed.chapter });
    }
  }
  return out;
}

/** Curated subjects for the chapters a note cites (in chapter-rank order, deduped). */
function passageSubjectsForText(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const { book, chapter } of citedChapters(text)) {
    for (const subject of chapterSubjects[book]?.[String(chapter)] ?? []) {
      const low = subject.toLowerCase();
      if (!seen.has(low)) {
        seen.add(low);
        out.push(subject);
      }
    }
  }
  return out;
}

/**
 * Enrich the keyword folder chrome with curated subjects — CONTENT-FIRST. The note's own text
 * (`contentSubjects`) drives the primary + early secondaries; cited-chapter passage subjects only
 * fill remaining secondary slots. All clean vocabulary subjects, deduped via `conceptOverlaps`.
 * Web-only (native is mirrored separately); a note with neither is a no-op.
 */
function withSubjectFolders(
  chrome: CollectionChromeState,
  title: string,
  bodyHtml: string,
  allowPrimaryUpdate: boolean,
): CollectionChromeState {
  const text = `${title}\n${plainBodyForFolderSnapshot(bodyHtml)}`;
  const contentSubs = contentSubjects(text).map((s) => s.name);
  const passageSubs = passageSubjectsForText(text).slice(0, MAX_PASSAGE_SUBJECTS);
  if (!contentSubs.length && !passageSubs.length) return chrome;

  // Primary: keep the content keyword primary; only fill an EMPTY primary (content first, then passage).
  let primary = chrome.primaryCollection;
  if (allowPrimaryUpdate && (!primary || !primary.trim())) {
    primary = contentSubs[0] ?? passageSubs[0] ?? primary;
  }
  const primaryRef = (primary ?? '').trim();
  const primaryLow = primaryRef.toLowerCase();

  const result: string[] = [];
  const present = new Set<string>();
  const add = (name: string) => {
    const low = name.trim().toLowerCase();
    if (!low || low === primaryLow || present.has(low)) return;
    if (primaryRef && conceptOverlaps(name, primaryRef)) return;
    if (result.some((r) => conceptOverlaps(r, name))) return;
    result.push(name);
    present.add(low);
  };
  for (const s of chrome.secondaryCollections) add(s); // existing keyword content secondaries (priority)
  for (const s of contentSubs) add(s); // content vocabulary subjects
  for (const s of passageSubs) add(s); // passage subjects — gap fill

  return { ...chrome, primaryCollection: primary, secondaryCollections: result.slice(0, MAX_SUBJECT_SECONDARIES) };
}

/**
 * Full title+body folder assignment (400ms live chip + 700ms autosave).
 * Body text required; title alone does not assign a primary folder.
 */
export function applyIdleFolderAutoAssign(
  prev: CollectionChromeState,
  title: string,
  bodyHtml: string,
  now: Date,
  allowPrimaryUpdate = true,
): CollectionChromeState {
  if (prev.collectionUserOverride && !prev.collectionPinned) return prev;

  if (isEffectivelyEmptyPrototypeNote(title, bodyHtml) || !hasAutoFolderBodyContent(bodyHtml)) {
    return clearAutoFolderChrome(prev);
  }

  return withSubjectFolders(
    applyAutoCollectionAfterEdit(prev, title, bodyHtml, now, { allowPrimaryUpdate }),
    title,
    bodyHtml,
    allowPrimaryUpdate,
  );
}

/** True when note-open auto folder should run (saved notes with body text). */
export function noteHasFolderSuggestContent(_title: string, bodyHtml: string): boolean {
  return hasAutoFolderBodyContent(bodyHtml);
}
