/**
 * Cache-scope regression for church starters.
 *
 * `syncStoredNoteTemplateInCaches` branched on `spaceId` only. An org template
 * has no spaceId, so a newly saved church starter fell through to the personal
 * path and appeared under the pastor's own templates instead of the church's —
 * until the next refetch quietly moved it. These tests pin the three scopes
 * apart.
 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  removeStoredNoteTemplateFromCaches,
  syncStoredNoteTemplateInCaches,
  type NoteTemplatesListResponse,
  type StoredNoteTemplate,
} from '../useNoteTemplates';

const template = (over: Partial<StoredNoteTemplate> = {}): StoredNoteTemplate => ({
  id: 'ntpl_1',
  userId: 'user_1',
  spaceId: null,
  orgId: null,
  name: 'Sermon notes',
  description: null,
  title: null,
  content: '<p>x</p>',
  noteType: 'default',
  iconColor: 'blue',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  source: 'stored',
  ...over,
});

const seed = (over: Partial<NoteTemplatesListResponse> = {}) => {
  const qc = new QueryClient();
  const initial: NoteTemplatesListResponse = {
    builtIn: [],
    personal: [],
    space: [],
    org: [],
    ...over,
  };
  qc.setQueryData(['note-templates', null], initial);
  return qc;
};

const read = (qc: QueryClient) =>
  qc.getQueryData<NoteTemplatesListResponse>(['note-templates', null])!;

const ids = (rows?: StoredNoteTemplate[]) => (rows ?? []).map((t) => t.id);

describe('syncStoredNoteTemplateInCaches', () => {
  it('files a church starter under org, not personal', () => {
    const qc = seed();
    syncStoredNoteTemplateInCaches(qc, template({ orgId: 'org_1' }));
    const next = read(qc);
    expect(ids(next.org)).toEqual(['ntpl_1']);
    expect(ids(next.personal)).toEqual([]);
    expect(ids(next.space)).toEqual([]);
  });

  it('files a space template under space', () => {
    const qc = seed();
    syncStoredNoteTemplateInCaches(qc, template({ spaceId: 'space_1' }));
    const next = read(qc);
    expect(ids(next.space)).toEqual(['ntpl_1']);
    expect(ids(next.personal)).toEqual([]);
    expect(ids(next.org)).toEqual([]);
  });

  it('files an unscoped template under personal', () => {
    const qc = seed();
    syncStoredNoteTemplateInCaches(qc, template());
    const next = read(qc);
    expect(ids(next.personal)).toEqual(['ntpl_1']);
    expect(ids(next.org)).toEqual([]);
  });

  it('moves a template out of personal when it becomes a church starter', () => {
    const qc = seed({ personal: [template()] });
    syncStoredNoteTemplateInCaches(qc, template({ orgId: 'org_1', name: 'Church sermon notes' }));
    const next = read(qc);
    expect(ids(next.personal)).toEqual([]);
    expect(next.org?.[0]?.name).toBe('Church sermon notes');
  });

  it('updates a church starter in place rather than duplicating it', () => {
    const qc = seed({ org: [template({ orgId: 'org_1' })] });
    syncStoredNoteTemplateInCaches(qc, template({ orgId: 'org_1', name: 'Renamed' }));
    const next = read(qc);
    expect(ids(next.org)).toEqual(['ntpl_1']);
    expect(next.org?.[0]?.name).toBe('Renamed');
  });

  it('drops a stale org copy when a template moves to a space', () => {
    const qc = seed({ org: [template({ orgId: 'org_1' })] });
    syncStoredNoteTemplateInCaches(qc, template({ spaceId: 'space_1' }));
    const next = read(qc);
    expect(ids(next.org)).toEqual([]);
    expect(ids(next.space)).toEqual(['ntpl_1']);
  });
});

describe('removeStoredNoteTemplateFromCaches', () => {
  it('removes a church starter from the org list', () => {
    const qc = seed({ org: [template({ orgId: 'org_1' })] });
    removeStoredNoteTemplateFromCaches(qc, 'ntpl_1');
    expect(ids(read(qc).org)).toEqual([]);
  });

  it('leaves other scopes alone', () => {
    const qc = seed({
      personal: [template({ id: 'keep_personal' })],
      org: [template({ id: 'ntpl_1', orgId: 'org_1' })],
    });
    removeStoredNoteTemplateFromCaches(qc, 'ntpl_1');
    const next = read(qc);
    expect(ids(next.org)).toEqual([]);
    expect(ids(next.personal)).toEqual(['keep_personal']);
  });
});
