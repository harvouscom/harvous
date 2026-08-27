import { describe, expect, it } from 'vitest';
import {
  NOTE_VISIT_DWELL_MIN_MS,
  NOTE_VISIT_DWELL_READ_MS,
  NOTE_VISIT_DWELL_STUDY_MS,
  isNoteVisitDwellBucket,
  nextNoteVisitDwellReport,
  noteVisitDwellBucket,
  noteVisitDwellIsRecordable,
  noteVisitIsSubstantive,
} from '../note-visit-kinds';

describe('note-visit dwell thresholds', () => {
  /*
   * Pinned as literals rather than compared to the constants, because the failure this
   * guards against is someone reaching for reading's 20s/240s — which the constants would
   * happily agree with.
   */
  it('uses note-length boundaries, not chapter-length ones', () => {
    expect(NOTE_VISIT_DWELL_MIN_MS).toBe(3_000);
    expect(NOTE_VISIT_DWELL_READ_MS).toBe(12_000);
    expect(NOTE_VISIT_DWELL_STUDY_MS).toBe(90_000);
  });

  it('buckets on those boundaries', () => {
    expect(noteVisitDwellBucket(0)).toBe('glance');
    expect(noteVisitDwellBucket(11_999)).toBe('glance');
    expect(noteVisitDwellBucket(12_000)).toBe('read');
    expect(noteVisitDwellBucket(89_999)).toBe('read');
    expect(noteVisitDwellBucket(90_000)).toBe('study');
  });

  it('records nothing below the floor', () => {
    expect(noteVisitDwellIsRecordable(2_999)).toBe(false);
    expect(noteVisitDwellIsRecordable(3_000)).toBe(true);
    expect(noteVisitDwellIsRecordable(Number.NaN)).toBe(false);
  });

  it('counts read and study as substantive, never a glance', () => {
    expect(noteVisitIsSubstantive('glance')).toBe(false);
    expect(noteVisitIsSubstantive('read')).toBe(true);
    expect(noteVisitIsSubstantive('study')).toBe(true);
  });

  it('validates bucket strings', () => {
    expect(isNoteVisitDwellBucket('read')).toBe(true);
    expect(isNoteVisitDwellBucket('skim')).toBe(false);
  });
});

describe('nextNoteVisitDwellReport', () => {
  it('stays quiet below the floor', () => {
    expect(nextNoteVisitDwellReport(1_000, null)).toBeNull();
  });

  it('reports the first bucket reached', () => {
    expect(nextNoteVisitDwellReport(5_000, null)).toBe('glance');
    expect(nextNoteVisitDwellReport(20_000, null)).toBe('read');
  });

  it('only reports again once the session has grown into a fuller bucket', () => {
    expect(nextNoteVisitDwellReport(20_000, 'glance')).toBe('read');
    expect(nextNoteVisitDwellReport(30_000, 'read')).toBeNull();
    expect(nextNoteVisitDwellReport(120_000, 'read')).toBe('study');
  });

  it('never downgrades', () => {
    expect(nextNoteVisitDwellReport(5_000, 'study')).toBeNull();
  });
});
