import { describe, expect, it, vi } from 'vitest';

/* ensureUserMetadata reads one row before anything else; answer "it exists". */
vi.mock('../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [{ userId: 'user_1' }],
  };
  return { db: chain, first: (rows: any[]) => rows[0], eq: () => null, UserMetadata: {}, Notes: {} };
});
vi.mock('../xp-system', () => ({}));
vi.mock('../process-scripture-references', () => ({
  transformCanonicalScriptureContent: ({ content }: { content: string }) => ({ updatedContent: content }),
}));
vi.mock('../highest-simple-note-id', () => ({ getEffectiveHighestSimpleNoteId: async () => 10 }));
vi.mock('../ensure-personal-home-space', () => ({ ensurePersonalHomeSpace: async () => 'space_home' }));
vi.mock('../note-version-service', () => ({}));
vi.mock('../note-versioning', () => ({ buildIndependentCopyAttribution: () => ({}) }));
vi.mock('../ensure-personal-library', () => ({}));

import { preparePackInstall } from '../discover-install';
import type { PackPayload } from '../discover-snapshot';

function note(sourceId: string, noteType = 'default') {
  return {
    sourceId,
    sourceVersionId: null,
    sourceAuthorId: 'user_author',
    title: sourceId,
    content: `<p>${sourceId}</p>`,
    noteType,
  } as PackPayload['notes'][number];
}

const thread = { title: 'Advent', subtitle: null, color: 'paper' };

describe('preparePackInstall', () => {
  it('installs a collection pack as a collection, every note in the Thread', async () => {
    const prepared = await preparePackInstall(
      { thread, notes: [note('a'), note('b')], references: [] },
      null,
      'user_1',
    );
    expect(prepared.thread?.mode).toBeUndefined();
    expect(prepared.junctionRows).toHaveLength(2);
  });

  it('installs a study plan as a plan: its steps, in order, starting at the first', async () => {
    const prepared = await preparePackInstall(
      {
        thread,
        // Payload order differs from step order, and one carried scripture note is not a step.
        notes: [note('week2'), note('week1'), note('isaiah', 'scripture'), note('week3')],
        references: [{ from: 'week1', to: 'isaiah' }],
        sequence: { stepSourceIds: ['week1', 'week2', 'week3'] },
      },
      null,
      'user_1',
    );
    const newIdBySource = new Map(
      prepared.noteRows.map((row) => [String(row.title), String(row.id)]),
    );
    const steps = ['week1', 'week2', 'week3'].map((s) => newIdBySource.get(s));

    expect(prepared.thread?.mode).toBe('sequence');
    expect(JSON.parse(String(prepared.thread?.sequenceNoteIds))).toEqual(steps);
    expect(prepared.thread?.sequenceCurrentNoteId).toBe(steps[0]);

    // The carried scripture note installs, but never as a step.
    const joined = new Set(prepared.junctionRows.map((r) => r.noteId));
    expect(joined).toEqual(new Set(steps));
    expect(prepared.noteRows).toHaveLength(4);
    expect(prepared.referenceRows).toHaveLength(1);
  });
});
