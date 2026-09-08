/**
 * Which room's recall suppression a read answers with.
 *
 * One rule, easy to state and easy to get subtly wrong: **NULL means personal Home.** Every
 * row written before `RecallEvents.spaceId` existed came from there — recall only ever ran in
 * the personal space — so those rows must keep suppressing where they were made, which is what
 * makes the column a no-backfill change.
 *
 * The two failures this guards are opposite and both silent: a dismissal made in a life group
 * following the reader home, and a legacy dismissal quietly ceasing to apply anywhere.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const spaceRows = vi.fn();
const isNull = vi.fn((col: unknown) => ({ op: 'isNull', col }));
const eq = vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val }));
const or = vi.fn((...args: unknown[]) => ({ op: 'or', args }));

vi.mock('../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => spaceRows(),
  };
  return {
    db: chain,
    first: (rows: unknown[]) => rows?.[0],
    RecallEvents: { spaceId: { __col: 'RecallEvents.spaceId' } },
    Spaces: { id: 'Spaces.id', userId: 'Spaces.userId', type: 'Spaces.type' },
    and: (...args: unknown[]) => ({ op: 'and', args }),
    eq: (...args: unknown[]) => eq(args[0], args[1]),
    isNull: (...args: unknown[]) => isNull(args[0]),
    or: (...args: unknown[]) => or(...args),
  };
});

vi.mock('@/utils/ids', () => ({ generateTimestampId: () => 'id' }));
vi.mock('./note-recall-state', () => ({ recordNoteRecallEngaged: vi.fn() }));
/* Recording a recall event also touches the study-bible layer, which arrived on
   main after this test was written and drags the whole note-read stack in behind
   it. Stubbed rather than fed: the subject here is which room a read answers
   for, and the db mock above is deliberately the four columns that question
   needs. */
vi.mock('../study-bible-layer', () => ({ noteTouch: vi.fn(), touchNodes: vi.fn() }));

const { resolveRecallRoomScope } = await import('../record-recall-event');

beforeEach(() => {
  vi.clearAllMocks();
  spaceRows.mockResolvedValue([]);
});

describe('resolveRecallRoomScope', () => {
  it('asked for nothing, answers with Home — the legacy rows', async () => {
    const scope = await resolveRecallRoomScope('user_1', null);
    expect(scope).toMatchObject({ op: 'isNull' });
    // No lookup needed to know that no room means Home.
    expect(spaceRows).not.toHaveBeenCalled();
  });

  it('asked for the reader’s own personal space, includes the legacy rows too', async () => {
    /*
      The personal space and NULL are one bucket. Without this, every dismissal
      made before the column existed would silently stop applying — the reader
      would get back a shelf of suggestions they had already turned down.
    */
    spaceRows.mockResolvedValue([{ id: 'space_home' }]);
    const scope = await resolveRecallRoomScope('user_1', 'space_home');
    expect(scope).toMatchObject({ op: 'or' });
    expect(JSON.stringify(scope)).toContain('isNull');
    expect(JSON.stringify(scope)).toContain('space_home');
  });

  it('asked for a shared room, answers with that room alone', async () => {
    // A dismissal made in a life group must not follow you home, and Home's must
    // not silence the group — so no NULL rows here.
    spaceRows.mockResolvedValue([]);
    const scope = await resolveRecallRoomScope('user_1', 'space_group');
    expect(scope).toMatchObject({ op: 'eq', val: 'space_group' });
    expect(JSON.stringify(scope)).not.toContain('isNull');
  });

  it('decides "is this my Home" from the database, never from the caller', async () => {
    /*
      The lookup is scoped to the caller and to `type='personal'`. Trusting a
      client-supplied "this is my home" would let a wrong guess lose or leak the
      reader's own dismissals — and it is the caller's own history either way, so
      the check is about correctness, not access.
    */
    await resolveRecallRoomScope('user_1', 'space_someone_elses_home');
    expect(spaceRows).toHaveBeenCalled();
    const args = eq.mock.calls.map((call) => call[1]);
    expect(args).toContain('user_1');
    expect(args).toContain('personal');
  });
});
