import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {}, sql: () => ({}) }));
vi.mock('../church-entitlement', () => ({ churchIsSponsored: () => true }));

import {
  CHURCH_REVIEW_DAILY_CAP,
  CHURCH_REVIEW_MAX_OUTSTANDING,
  capChurchShare,
  pickChurchDeliveries,
  reviewKindForChurchExercise,
} from '../church-review-delivery';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const delivery = () => source('server/utils/church-review-delivery.ts');

const candidate = (id: string, reference: string | null = null) => ({
  id,
  kind: reference ? 'verse' : 'choice',
  version: 1,
  scriptureReference: reference,
  translation: null,
  channelTitle: 'Youth',
});

describe('pickChurchDeliveries', () => {
  const base = { heldExerciseIds: new Set<string>(), ownPassageKeys: new Set<string>(), addedToday: 0, outstanding: 0 };

  it('hands over the newest first, no more than the daily cap', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidate(`crx_${i}`));
    const picked = pickChurchDeliveries({ ...base, candidates });
    expect(picked.map((c) => c.id)).toEqual(['crx_0', 'crx_1', 'crx_2']);
    expect(picked).toHaveLength(CHURCH_REVIEW_DAILY_CAP);
  });

  it('adds nothing once today is spent, or the reader already has plenty waiting', () => {
    const candidates = [candidate('a'), candidate('b')];
    expect(pickChurchDeliveries({ ...base, candidates, addedToday: CHURCH_REVIEW_DAILY_CAP })).toEqual([]);
    expect(pickChurchDeliveries({ ...base, candidates, outstanding: CHURCH_REVIEW_MAX_OUTSTANDING })).toEqual([]);
    expect(pickChurchDeliveries({ ...base, candidates, outstanding: CHURCH_REVIEW_MAX_OUTSTANDING - 1 })).toHaveLength(1);
  });

  it('never brings back one the reader holds in any status — archived stays archived', () => {
    const picked = pickChurchDeliveries({ ...base, candidates: [candidate('a'), candidate('b')], heldExerciseIds: new Set(['a']) });
    expect(picked.map((c) => c.id)).toEqual(['b']);
  });

  it('skips a passage the reader already reviews as their own', () => {
    const picked = pickChurchDeliveries({
      ...base,
      candidates: [candidate('a', 'John 3:16'), candidate('b', 'Romans 8:28')],
      ownPassageKeys: new Set(['john 3:16']),
    });
    expect(picked.map((c) => c.id)).toEqual(['b']);
  });
});

describe('capChurchShare', () => {
  const rows = [
    { id: 1, origin: 'church' },
    { id: 2, origin: 'user' },
    { id: 3, origin: 'church' },
    { id: 4, origin: 'church' },
    { id: 5, origin: 'church' },
  ];

  it('keeps a Plus reader’s own study in front: at most three church rows a sitting', () => {
    expect(capChurchShare(rows, { access: 'full' }).map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it('keeps everything for a church-only reader — it is all they have', () => {
    expect(capChurchShare(rows, { access: 'church' })).toHaveLength(5);
  });
});

describe('reviewKindForChurchExercise', () => {
  it('asks a passage on its own ladder and a written question as a church question', () => {
    expect(reviewKindForChurchExercise('verse')).toBe('verse');
    expect(reviewKindForChurchExercise('chapter')).toBe('chapter');
    expect(reviewKindForChurchExercise('choice')).toBe('church');
    expect(reviewKindForChurchExercise('match')).toBe('church');
  });
});

describe('delivery contracts', () => {
  it('never pairs a church row with a note — the cascade would erase other readers’ history', () => {
    const insert = delivery().slice(delivery().indexOf('.insert(ReviewItems)'));
    expect(insert).toContain('noteId: null');
    expect(insert).toContain("origin: 'church'");
    expect(insert).toContain('sourceKey: `church:${pick.id}`');
    expect(insert).toContain('.onConflictDoNothing()');
  });

  it('holds a church row only while it is published, its channel is live, and the reader follows it', () => {
    const held = delivery().slice(delivery().indexOf('export function churchItemHeldSql'), delivery().indexOf('/** Who can see what'));
    expect(held).toContain("${ChurchReviewExercises.status} = 'published'");
    expect(held).toContain('${Spaces.deletedAt} IS NULL');
    expect(held).toContain("${SpaceMemberships.role} = 'member'");
    expect(held).toContain('${SpaceMemberships.userId} = ${ReviewItems.userId}');
  });

  it('delivers only to followers, and new ones only from a sponsored church', () => {
    const text = delivery();
    expect(text).toContain("eq(SpaceMemberships.role, 'member')");
    expect(text).toContain('churchIsSponsored(row)');
    expect(text).toContain('const fresh = published.filter((e) => sponsored.has(e.channelSpaceId));');
  });

  it('catches an edited question up on the reader’s own read, never from the church side', () => {
    const text = delivery();
    const reset = text.slice(text.indexOf('Staff edited a question'), text.indexOf('// New ones only'));
    expect(reset).toContain('eq(ReviewItems.userId, userId)');
    expect(reset).toContain("row.status === 'archived'");
    const code = source('server/routes/church-review.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\bReviewItems\b/);
  });

  it('counts an answer once per person', () => {
    const fn = delivery().slice(delivery().indexOf('export async function countChurchAnswer'));
    expect(fn).toContain('item.reviewCount > 0) return');
  });
});

describe('review access', () => {
  const access = () => source('server/utils/review-access.ts');

  it('is never an entitlement — Plus stays Plus', () => {
    expect(access()).not.toMatch(/grantEntitlement|church_seat|insert\(Entitlements\)/);
  });

  it('asks the billing provider throttled, since a church-only reader misses every time', () => {
    expect(access()).toContain("hasFeatureWithReconcile(auth, 'review', { throttle: true })");
  });

  it('opens church-only Review to someone connected to an active church, and nobody else', () => {
    const fn = access().slice(access().indexOf('export async function resolveReviewAccess'));
    expect(fn).toContain("return church?.isActive ? 'church' : 'none';");
    expect(fn).toContain("if (!meta?.connectedOrgId) return 'none';");
  });
});
