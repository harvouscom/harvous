import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLimit = vi.fn();
const mockSelect = vi.fn();

vi.mock('../../db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
  first: (rows: unknown[]) => (Array.isArray(rows) ? rows[0] : undefined),
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
  Churches: { hmcChurchId: 'hmcChurchId', deletedAt: 'deletedAt', id: 'id', orgId: 'orgId', isActive: 'isActive' },
}));

// Mirrors the real module: despite the name, nowISO() returns a Date, matching the
// ts() columns these values are written to. The old string stub is what let a string
// connectedChurchAt look correct in tests while heading for a Date column.
vi.mock('../../db/dates', () => ({
  nowISO: () => new Date('2026-07-24T12:00:00.000Z'),
  toDate: (val: Date | string | null | undefined) => {
    if (val == null) return null;
    if (val instanceof Date) return val;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  },
}));

import {
  CLEARED_CHURCH_CONNECTION,
  connectionFieldsForHmcChurchId,
  findActiveChurchByHmcId,
} from '../church-connection';

function mockChurchRow(row: { id: string; orgId: string; isActive: boolean } | null) {
  mockLimit.mockResolvedValueOnce(row ? [row] : []);
  mockSelect.mockReturnValueOnce({
    from: () => ({
      where: () => ({
        limit: mockLimit,
      }),
    }),
  });
}

describe('church-connection', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockLimit.mockReset();
  });

  it('findActiveChurchByHmcId returns active registered church', async () => {
    mockChurchRow({ id: 'chur_1', orgId: 'org_1', isActive: true });
    await expect(findActiveChurchByHmcId('TX-123')).resolves.toEqual({
      id: 'chur_1',
      orgId: 'org_1',
    });
  });

  it('findActiveChurchByHmcId ignores inactive churches', async () => {
    mockChurchRow({ id: 'chur_1', orgId: 'org_1', isActive: false });
    await expect(findActiveChurchByHmcId('TX-123')).resolves.toBeNull();
  });

  it('connectionFieldsForHmcChurchId links matching HMC to connected*', async () => {
    mockChurchRow({ id: 'chur_1', orgId: 'org_1', isActive: true });
    await expect(connectionFieldsForHmcChurchId('TX-123')).resolves.toEqual({
      connectedChurchId: 'chur_1',
      connectedOrgId: 'org_1',
      connectedChurchAt: new Date('2026-07-24T12:00:00.000Z'),
    });
  });

  it('connectionFieldsForHmcChurchId clears when HMC is unmatched', async () => {
    mockChurchRow(null);
    await expect(connectionFieldsForHmcChurchId('TX-999')).resolves.toEqual(CLEARED_CHURCH_CONNECTION);
  });

  it('connectionFieldsForHmcChurchId clears when HMC is null', async () => {
    await expect(connectionFieldsForHmcChurchId(null)).resolves.toEqual(CLEARED_CHURCH_CONNECTION);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('preserves connectedChurchAt when requested', async () => {
    mockChurchRow({ id: 'chur_1', orgId: 'org_1', isActive: true });
    await expect(
      connectionFieldsForHmcChurchId('TX-123', { preserveConnectedAt: '2026-01-01T00:00:00.000Z' }),
    ).resolves.toMatchObject({
      connectedChurchId: 'chur_1',
      connectedOrgId: 'org_1',
      // A preserved ISO string is normalized to a Date before it is persisted.
      connectedChurchAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });
});
