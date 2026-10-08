/**
 * Acknowledgments record the server's versions, once per version, and a database without the
 * table yet answers "nothing due" rather than failing — so nobody meets a notice they cannot clear.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Latest acknowledged version per document, as the table would answer it. */
let latest: Record<string, string | null> = {};
let missingTable = false;
const inserted: Array<Record<string, unknown>> = [];

vi.mock('../../db', () => {
  const select = () => {
    let doc = '';
    const chain = {
      from: () => chain,
      where: (cond: unknown[]) => {
        // `and(eq(userId,…), eq(document, doc))` — the mocks below make each a tuple.
        doc = String(((cond as unknown[])[1] as unknown[])[1]);
        return chain;
      },
      orderBy: () => chain,
      limit: async () => {
        if (missingTable) throw new Error('relation "LegalAcknowledgments" does not exist');
        return latest[doc] ? [{ version: latest[doc] }] : [];
      },
    };
    return chain;
  };
  return {
    db: {
      select,
      insert: () => ({
        values: async (rows: Array<Record<string, unknown>>) => {
          if (missingTable) throw new Error('relation "LegalAcknowledgments" does not exist');
          for (const row of rows) {
            inserted.push(row);
            latest[String(row.document)] = String(row.version);
          }
        },
      }),
    },
    LegalAcknowledgments: { userId: 'userId', document: 'document', version: 'version' },
    and: (...args: unknown[]) => args,
    eq: (...args: unknown[]) => args,
    desc: (x: unknown) => x,
  };
});

const { acknowledgeLegal, legalStatusForUser } = await import('../legal-acknowledgments');
const { LEGAL } = await import('@/utils/legal-versions');

beforeEach(() => {
  latest = {};
  missingTable = false;
  inserted.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('legal acknowledgments', () => {
  it('owes a fresh account both documents', async () => {
    const status = await legalStatusForUser('user_1');
    expect(status.due).toEqual(['privacy', 'terms']);
  });

  it('records the server’s current versions, with where it happened', async () => {
    const status = await acknowledgeLegal('user_1', ['privacy', 'terms'], 'signup');
    expect(inserted.map((r) => [r.document, r.version, r.surface])).toEqual([
      ['privacy', LEGAL.privacy.version, 'signup'],
      ['terms', LEGAL.terms.version, 'signup'],
    ]);
    expect(status.due).toEqual([]);
  });

  it('writes nothing for a version already acknowledged', async () => {
    latest = { privacy: LEGAL.privacy.version };
    await acknowledgeLegal('user_1', ['privacy', 'terms'], 'notice');
    expect(inserted.map((r) => r.document)).toEqual(['terms']);
  });

  it('answers nothing due, and records nothing, before the table exists', async () => {
    missingTable = true;
    expect((await legalStatusForUser('user_1')).due).toEqual([]);
    expect((await acknowledgeLegal('user_1', ['privacy'], 'notice')).due).toEqual([]);
    expect(inserted).toHaveLength(0);
  });
});
