/**
 * The shape of the work, not the answer it produces.
 *
 * `getConnectSuggestions` used to walk its candidates one at a time, awaiting two passage
 * queries and a full ranking pass for each before starting the next. Every one of those
 * ranking passes re-ran the same per-user candidate scan, so twenty candidates meant twenty
 * identical scans and roughly a hundred and twenty round trips in series — measured at 4.2
 * seconds against a real database, which was long enough to hold the entire Home dashboard
 * on its loading dots until the presentation deadline gave up waiting.
 *
 * Nothing about the result changed, so a test on the returned suggestions would not have
 * caught the regression and would not catch it coming back. These assertions are about
 * per-candidate work: the scan happens once, the passages are fetched in one pass, and the
 * ranking runs concurrently. Sibling file `connect-suggestions.test.ts` covers the ranking
 * itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectCalls: unknown[][] = [];
let selectBatches: unknown[][] = [];

/** One chainable stub standing in for `select().from().where()`, resolving the next batch. */
function makeChain() {
  const rows = selectBatches.shift() ?? [];
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'innerJoin', 'orderBy', 'limit']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  return {
    ...actual,
    db: {
      ...actual.db,
      select: (...args: unknown[]) => {
        selectCalls.push(args);
        return makeChain();
      },
    },
  };
});

const mockGetRelatedNoteCandidates = vi.fn();
const mockGetRelatedNotesForPassages = vi.fn();

vi.mock('../scripture-knowledge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripture-knowledge')>();
  return {
    ...actual,
    getRelatedNoteCandidates: (...a: unknown[]) => mockGetRelatedNoteCandidates(...a),
    getRelatedNotesForPassages: (...a: unknown[]) => mockGetRelatedNotesForPassages(...a),
  };
});

const { getConnectSuggestions } = await import('../connect-suggestions');

/** Five notes, each tagged with a distinct verse, none of them connected to each other. */
function seedFiveUnconnectedNotes() {
  const noteIds = ['n1', 'n2', 'n3', 'n4', 'n5'];
  selectBatches = [
    // userNotes
    noteIds.map((id) => ({ id, title: `Note ${id}` })),
    // NoteConnections edges — none
    [],
    // getNotePassagesBatch: NoteScriptureReferences links — none
    [],
    // getNotePassagesBatch: ScriptureMetadata rows, one verse per note
    noteIds.map((id, i) => ({ noteId: id, book: 'Romans', chapter: 8, verse: i + 1 })),
  ];
  return noteIds;
}

beforeEach(() => {
  selectCalls.length = 0;
  selectBatches = [];
  mockGetRelatedNoteCandidates.mockReset();
  mockGetRelatedNotesForPassages.mockReset();
  mockGetRelatedNoteCandidates.mockResolvedValue([
    { noteId: 'n9', book: 'Romans', chapter: 8, verse: 1 },
  ]);
  mockGetRelatedNotesForPassages.mockResolvedValue([]);
});

describe('getConnectSuggestions does its lookups in bulk', () => {
  it('scans for candidates once for the whole run, not once per candidate', async () => {
    seedFiveUnconnectedNotes();
    await getConnectSuggestions('user_1');

    expect(mockGetRelatedNoteCandidates).toHaveBeenCalledTimes(1);
    // Five candidates were ranked, so the old code would have scanned five times.
    expect(mockGetRelatedNotesForPassages.mock.calls.length).toBeGreaterThan(1);
  });

  it('hands every ranking pass the same candidate rows it already fetched', async () => {
    seedFiveUnconnectedNotes();
    await getConnectSuggestions('user_1');

    const scanned = await mockGetRelatedNoteCandidates.mock.results[0]!.value;
    for (const call of mockGetRelatedNotesForPassages.mock.calls) {
      expect(call[2]).toMatchObject({ candidates: scanned });
    }
  });

  it('fetches every candidate note’s passages in one pass', async () => {
    const noteIds = seedFiveUnconnectedNotes();
    await getConnectSuggestions('user_1');

    // userNotes, existing edges, then the two that make up the batched passage lookup.
    // Per-candidate passage queries would put this at 2 + 2 x candidates.
    expect(selectCalls.length).toBeLessThanOrEqual(2 + 2);
    expect(selectCalls.length).toBeLessThan(2 + 2 * noteIds.length);
  });

  it('ranks candidates concurrently rather than one after another', async () => {
    seedFiveUnconnectedNotes();
    let inFlight = 0;
    let peak = 0;
    mockGetRelatedNotesForPassages.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return [];
    });

    await getConnectSuggestions('user_1');
    // Serial ranking never exceeds one in flight; the chunk size is 4.
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('stops early once it has enough suggestions instead of ranking every candidate', async () => {
    seedFiveUnconnectedNotes();
    mockGetRelatedNotesForPassages.mockResolvedValue([
      { noteId: 'n9', score: 9, sharedPassages: ['Romans|8|1'], sharedCrossRefs: [], sharedThemes: [], sameSection: false },
    ]);

    await getConnectSuggestions('user_1', { limit: 3 });
    // The first chunk of four already yields three pairs, so the fifth is never ranked.
    expect(mockGetRelatedNotesForPassages.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
