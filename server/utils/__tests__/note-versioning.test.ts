import { describe, expect, it } from 'vitest';
import {
  NoteVersionAccessError,
  assertCanAccessNoteVersions,
  buildIndependentCopyAttribution,
  buildMigrationBaselineVersion,
  buildNoteVersionSnapshot,
  isCurrentVersionIntegrityValid,
  nextNoteVersionNumber,
  partitionNoteVersionsForRetention,
  shouldCreateNoteVersionCheckpoint,
} from '../note-versioning';

describe('note versioning', () => {
  it('enforces author-only history access and snapshot authorship', () => {
    expect(() => assertCanAccessNoteVersions('user_author', 'user_other')).toThrowError(NoteVersionAccessError);

    const createdAt = new Date('2026-07-09T12:00:00Z');
    expect(
      buildNoteVersionSnapshot({
        id: 'nver_1',
        noteId: 'note_1',
        noteAuthorId: 'user_author',
        actorId: 'user_author',
        version: 1,
        content: { title: 'Title', content: 'Body', contentEncrypted: false },
        source: 'migration-baseline',
        createdAt,
      }),
    ).toEqual({
      id: 'nver_1',
      noteId: 'note_1',
      version: 1,
      title: 'Title',
      content: 'Body',
      contentEncrypted: false,
      source: 'migration-baseline',
      authorId: 'user_author',
      editedBy: 'user_author',
      createdAt,
    });
  });

  it('lets an authorized collaborator checkpoint without becoming the author', () => {
    const createdAt = new Date('2026-07-09T12:00:00Z');
    const base = {
      id: 'nver_2',
      noteId: 'note_1',
      noteAuthorId: 'user_author',
      actorId: 'user_collaborator',
      version: 2,
      content: { title: 'Title', content: 'Their edit', contentEncrypted: false },
      createdAt,
    };

    // Without the role the strict assert still guards every existing caller.
    expect(() => buildNoteVersionSnapshot(base)).toThrowError(NoteVersionAccessError);

    const snapshot = buildNoteVersionSnapshot({ ...base, actorRole: 'collaborator' });
    // authorId stays the permanent author — history access and the
    // currentVersion integrity check both depend on it.
    expect(snapshot.authorId).toBe('user_author');
    expect(snapshot.editedBy).toBe('user_collaborator');
  });

  it('increments monotonically from the greatest valid version', () => {
    expect(nextNoteVersionNumber([{ version: 3 }, { version: 1 }, { version: 7 }])).toBe(8);
    expect(nextNoteVersionNumber([])).toBe(1);
  });

  it('timestamps migration baselines at migration time, not note creation time', () => {
    const migrationTime = new Date('2026-07-09T12:00:00Z');
    const baseline = buildMigrationBaselineVersion({
      id: 'nver_baseline',
      noteId: 'note_old',
      noteAuthorId: 'user_author',
      content: { title: null, content: '<p>Old note</p>', contentEncrypted: false },
      migrationTime,
    });
    expect(baseline.createdAt).toBe(migrationTime);
    expect(baseline.createdAt).not.toEqual(new Date('2020-01-01T00:00:00Z'));
  });

  it('coalesces meaningful saves but always checkpoints explicit restore', () => {
    const latest = {
      id: 'nver_1',
      noteId: 'note_1',
      version: 1,
      title: 'Title',
      content: 'Old body',
      contentEncrypted: false,
      source: 'save',
      authorId: 'user_author',
      editedBy: 'user_author',
      createdAt: new Date('2026-07-09T12:00:00Z'),
    };
    const changed = { title: 'Title', content: 'New body', contentEncrypted: false };

    expect(
      shouldCreateNoteVersionCheckpoint({
        latest,
        next: changed,
        now: new Date('2026-07-09T12:04:00Z'),
      }),
    ).toBe(false);
    expect(
      shouldCreateNoteVersionCheckpoint({
        latest,
        next: changed,
        now: new Date('2026-07-09T12:05:00Z'),
      }),
    ).toBe(true);
    expect(
      shouldCreateNoteVersionCheckpoint({
        latest,
        next: changed,
        now: new Date('2026-07-09T12:01:00Z'),
        source: 'restore',
      }),
    ).toBe(true);
    expect(
      shouldCreateNoteVersionCheckpoint({
        latest,
        next: { title: 'Title', content: 'Old body', contentEncrypted: false },
        now: new Date('2026-07-09T12:10:00Z'),
      }),
    ).toBe(false);
  });

  it('retains the latest 100 plus every version from the last 90 days', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const recent = new Date('2026-07-01T12:00:00Z');
    const old = new Date('2025-01-01T12:00:00Z');
    const versions = Array.from({ length: 150 }, (_, index) => ({
      id: `nver_${index + 1}`,
      version: index + 1,
      createdAt: index < 40 ? recent : old,
    }));

    const { retained, prunable } = partitionNoteVersionsForRetention(versions, now);
    expect(retained).toHaveLength(140);
    expect(new Set(retained.map((row) => row.version))).toEqual(
      new Set([...Array.from({ length: 40 }, (_, index) => index + 1), ...Array.from({ length: 100 }, (_, index) => index + 51)]),
    );
    expect(prunable.map((row) => row.version)).toEqual([50, 49, 48, 47, 46, 45, 44, 43, 42, 41]);
  });

  it('retains the exact 90-day boundary and prunes one millisecond before it', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;
    const versions = [
      { id: 'boundary', version: 1, createdAt: new Date(cutoff) },
      { id: 'before', version: 2, createdAt: new Date(cutoff - 1) },
    ];
    const { retained, prunable } = partitionNoteVersionsForRetention(versions, now, { maxRecent: 0 });
    expect(retained.map((row) => row.id)).toEqual(['boundary']);
    expect(prunable.map((row) => row.id)).toEqual(['before']);
  });

  it('builds durable attribution for an independent copy', () => {
    expect(
      buildIndependentCopyAttribution({
        sourceNoteId: 'note_source',
        sourceVersionId: 'nver_4',
        sourceAuthorId: 'user_source',
        sourceAuthorDisplayName: '  Ruth ',
      }),
    ).toEqual({
      copiedFromNoteId: 'note_source',
      copiedFromVersionId: 'nver_4',
      copiedFromAuthorId: 'user_source',
      copiedFromAuthorDisplayName: 'Ruth',
    });
  });

  it('validates the current version belongs to the note and author', () => {
    const note = { id: 'note_1', userId: 'user_author', currentVersionId: 'nver_2' };
    expect(
      isCurrentVersionIntegrityValid(note, {
        id: 'nver_2',
        noteId: 'note_1',
        authorId: 'user_author',
        version: 2,
      }, 2),
    ).toBe(true);
    expect(
      isCurrentVersionIntegrityValid(note, {
        id: 'nver_2',
        noteId: 'note_other',
        authorId: 'user_author',
        version: 2,
      }, 2),
    ).toBe(false);
    expect(
      isCurrentVersionIntegrityValid(note, {
        id: 'nver_2',
        noteId: 'note_1',
        authorId: 'user_author',
        version: 2,
      }, 3),
    ).toBe(false);
    expect(isCurrentVersionIntegrityValid(note, null, null)).toBe(false);
  });
});
