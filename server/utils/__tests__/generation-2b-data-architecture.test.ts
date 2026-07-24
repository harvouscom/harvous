import { describe, expect, it, vi } from 'vitest';
import {
  ADDITIVE_SHARED_SPACES_DDL,
} from '../../scripts/add-shared-spaces-schema';
import {
  loadSharedSpacesMigrationIdentity,
  SHARED_SPACES_PRODUCTION_ACK,
} from '../../scripts/shared-spaces-migration-target';
import {
  CANONICAL_SPACE_NOTE_PREFLIGHT_CHECKS,
  summarizePreflight,
} from '../../scripts/preflight-canonical-space-notes';
import { buildDurableAnchorReresolutionPatch } from '../durable-note-anchor';
import {
  safeMemberDisplayName,
  serializeSpaceMemberForViewer,
  canReadSharedThread,
} from '../shared-space-lifecycle';
import { visibleSharedThreadsForViewer } from '../dashboard-data';
import { createPurgeSharedSpacesHandler } from '../../netlify-purge-shared-spaces';
import { classifyLegacyCanonicalRepair } from '../../scripts/backfill-canonical-space-notes';

describe('Generation 2B data architecture policies', () => {
  it('keeps additive DDL idempotent and defers data-dependent constraints', () => {
    expect(ADDITIVE_SHARED_SPACES_DDL.every((statement) => /IF NOT EXISTS/i.test(statement))).toBe(true);
    expect(ADDITIVE_SHARED_SPACES_DDL.join('\n')).not.toContain('Threads_onePinnedPerSpace');
    expect(ADDITIVE_SHARED_SPACES_DDL.join('\n')).not.toContain('NoteVersions_note_version_unique');
    expect(ADDITIVE_SHARED_SPACES_DDL.join('\n')).toContain('"resolvedVersionId"');
  });

  it('requires a matching direct project identity and exact production acknowledgement', () => {
    const base = {
      SHARED_SPACES_MIGRATION_DATABASE_URL:
        'postgresql://postgres:secret@db.staging.supabase.co:5432/postgres',
      SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF: 'staging',
      SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF: 'production',
      SHARED_SPACES_MIGRATION_ENVIRONMENT: 'staging',
    };
    expect(loadSharedSpacesMigrationIdentity(base)).toMatchObject({
      databaseUrl: base.SHARED_SPACES_MIGRATION_DATABASE_URL,
      projectRef: 'staging',
      environment: 'staging',
    });
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...base,
        SHARED_SPACES_MIGRATION_DATABASE_URL:
          'postgresql://postgres:secret@aws-0-us.pooler.supabase.com:6543/postgres',
      }),
    ).toThrow('direct migration');
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...base,
        SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF: 'other',
      }),
    ).toThrow('project ref mismatch');
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...base,
        SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF: '',
      }),
    ).toThrow('SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF is required');

    const production = {
      ...base,
      SHARED_SPACES_MIGRATION_DATABASE_URL:
        'postgresql://postgres:secret@db.production.supabase.co:5432/postgres',
      SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF: 'production',
      SHARED_SPACES_MIGRATION_ENVIRONMENT: 'production',
    };
    expect(() => loadSharedSpacesMigrationIdentity(production)).toThrow(
      'Production requires SHARED_SPACES_MIGRATION_PRODUCTION_ACK',
    );
    expect(
      loadSharedSpacesMigrationIdentity({
        ...production,
        SHARED_SPACES_MIGRATION_PRODUCTION_ACK: SHARED_SPACES_PRODUCTION_ACK,
      }).environment,
    ).toBe('production');
  });

  it('rejects staging labels and inconsistent expectations for the known production ref', () => {
    const staging = {
      SHARED_SPACES_MIGRATION_DATABASE_URL:
        'postgresql://postgres:secret@db.staging.supabase.co:5432/postgres',
      SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF: 'staging',
      SHARED_SPACES_MIGRATION_PRODUCTION_PROJECT_REF: 'production',
      SHARED_SPACES_MIGRATION_ENVIRONMENT: 'staging',
    };
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...staging,
        SHARED_SPACES_MIGRATION_DATABASE_URL:
          'postgresql://postgres:secret@db.production.supabase.co:5432/postgres',
      }),
    ).toThrow('Refusing staging migration');
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...staging,
        SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF: 'production',
      }),
    ).toThrow('Staging requires SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF to differ');
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...staging,
        SHARED_SPACES_MIGRATION_ENVIRONMENT: 'production',
        SHARED_SPACES_MIGRATION_PRODUCTION_ACK: SHARED_SPACES_PRODUCTION_ACK,
      }),
    ).toThrow('Refusing production migration');
    expect(() =>
      loadSharedSpacesMigrationIdentity({
        ...staging,
        SHARED_SPACES_MIGRATION_DATABASE_URL:
          'postgresql://postgres:secret@db.production.supabase.co:5432/postgres',
        SHARED_SPACES_MIGRATION_ENVIRONMENT: 'production',
        SHARED_SPACES_MIGRATION_PRODUCTION_ACK: SHARED_SPACES_PRODUCTION_ACK,
      }),
    ).toThrow('Production requires SHARED_SPACES_MIGRATION_EXPECTED_PROJECT_REF to equal');
  });

  it('classifies legacy repair as migration work and only unsafe counts as failure', () => {
    const migration = CANONICAL_SPACE_NOTE_PREFLIGHT_CHECKS.find(
      (check) => check.name === 'notes needing version 1',
    )!;
    const unsafe = CANONICAL_SPACE_NOTE_PREFLIGHT_CHECKS.find(
      (check) => check.name === 'duplicate note version numbers',
    )!;
    expect(summarizePreflight([
      { check: migration, count: 12 },
      { check: unsafe, count: 0 },
    ])).toEqual({ migrationCount: 12, unsafeCount: 0 });
  });

  it('deterministically associates valid legacy notes and rehomes unsafe ones', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const space = {
      id: 'space_shared',
      userId: 'owner',
      type: 'shared',
      deletedAt: null,
      recoveryUntil: null,
    };
    const membership = {
      id: 'membership',
      spaceId: space.id,
      userId: 'member',
      role: 'member',
    };
    expect(classifyLegacyCanonicalRepair({
      note: { id: 'note', userId: 'member', contentEncrypted: false },
      space,
      membership,
      now,
    })).toBe('eligible');
    expect(classifyLegacyCanonicalRepair({
      note: { id: 'note', userId: 'member', contentEncrypted: true },
      space,
      membership,
      now,
    })).toBe('encrypted-note');
    expect(classifyLegacyCanonicalRepair({
      note: { id: 'owner-note', userId: 'owner', contentEncrypted: false },
      space,
      membership: null,
      now,
    })).toBe('eligible');
    expect(classifyLegacyCanonicalRepair({
      note: { id: 'recoverable', userId: 'member', contentEncrypted: false },
      space: {
        ...space,
        deletedAt: new Date('2026-07-01T00:00:00Z'),
        recoveryUntil: new Date('2026-08-01T00:00:00Z'),
      },
      membership,
      now,
    })).toBe('eligible');
    expect(classifyLegacyCanonicalRepair({
      note: { id: 'expired', userId: 'member', contentEncrypted: false },
      space: {
        ...space,
        deletedAt: new Date('2026-06-01T00:00:00Z'),
        recoveryUntil: new Date('2026-07-01T00:00:00Z'),
      },
      membership,
      now,
    })).toBe('deleted-space');
  });

  it('re-resolves exact, moved, ambiguous, missing, and restore anchors without rewriting selectors', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const base = {
      anchorQuote: 'target',
      anchorPrefixContext: 'alpha ',
      anchorSuffixContext: ' omega',
      resolvedAnchorStart: 6,
      resolvedAnchorEnd: 12,
    };
    expect(buildDurableAnchorReresolutionPatch({
      row: base,
      html: '<p>alpha target omega</p>',
      resolvedVersionId: 'v2',
      now,
    })).toMatchObject({
      resolvedVersionId: 'v2',
      anchorStatus: 'resolved',
      resolvedAnchorStart: 6,
      resolvedAnchorEnd: 12,
    });
    expect(buildDurableAnchorReresolutionPatch({
      row: base,
      html: '<p>intro alpha target omega</p>',
      resolvedVersionId: 'v3',
      now,
    })).toMatchObject({
      anchorStatus: 'resolved',
      resolvedAnchorStart: 12,
      resolvedAnchorEnd: 18,
    });
    expect(buildDurableAnchorReresolutionPatch({
      row: { ...base, anchorPrefixContext: '', anchorSuffixContext: '', resolvedAnchorStart: null, resolvedAnchorEnd: null },
      html: '<p>target and target</p>',
      resolvedVersionId: 'v4',
      now,
    })).toMatchObject({ anchorStatus: 'detached', resolvedAnchorStart: null });
    expect(buildDurableAnchorReresolutionPatch({
      row: base,
      html: '<p>alpha replacement omega</p>',
      resolvedVersionId: 'v5',
      now,
    })).toMatchObject({ anchorStatus: 'detached', resolvedVersionId: 'v5' });
    expect(buildDurableAnchorReresolutionPatch({
      row: base,
      html: '<p>alpha target omega</p>',
      resolvedVersionId: 'v-restore',
      now,
    })).toMatchObject({ anchorStatus: 'resolved', resolvedVersionId: 'v-restore' });
  });

  it('uses an explicit abbreviated member allowlist for non-owners', () => {
    const serialized = serializeSpaceMemberForViewer({
      userId: 'user_1',
      role: 'member',
      joinedAt: new Date('2026-07-01T00:00:00Z'),
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      profileImageUrl: 'https://example.test/avatar.png',
      userColor: 'blue',
      nested: { email: 'hidden@example.com' },
    }, false);
    expect(serialized).toEqual({
      userId: 'user_1',
      role: 'member',
      joinedAt: new Date('2026-07-01T00:00:00Z'),
      displayName: 'Ada L.',
      profileImageUrl: 'https://example.test/avatar.png',
      userColor: 'blue',
    });
    expect(JSON.stringify(serialized)).not.toMatch(/example\.com|Lovelace/);
    expect(safeMemberDisplayName({ firstName: null, lastName: 'Private' })).toBe('Member');
  });

  it('shows only the current pinned Thread to members', () => {
    const threads = [
      { id: 'current', isPinned: true },
      { id: 'hidden', isPinned: false },
    ];
    expect(visibleSharedThreadsForViewer(threads, false)).toEqual([threads[0]]);
    expect(visibleSharedThreadsForViewer(threads, true)).toEqual(threads);
  });

  it('lets the actual owner read all shared Threads while members only read current', () => {
    const space = { userId: 'owner', deletedAt: null };
    expect(canReadSharedThread({
      viewerUserId: 'owner',
      thread: { isPinned: false },
      space,
      membership: null,
    })).toBe(true);
    expect(canReadSharedThread({
      viewerUserId: 'member',
      thread: { isPinned: false },
      space,
      membership: { role: 'member' },
    })).toBe(false);
    expect(canReadSharedThread({
      viewerUserId: 'member',
      thread: { isPinned: true },
      space,
      membership: { role: 'member' },
    })).toBe(true);
  });

  it('runs a bounded scheduled purge through an injectable pure handler', async () => {
    const purge = vi.fn(async () => ['space_1']);
    const response = await createPurgeSharedSpacesHandler(purge)();
    expect(purge).toHaveBeenCalledWith(expect.any(Date), 50);
    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse(response.body)).toEqual({ purged: 1, remaining: false });
  });

  it('drains multiple expired-space batches in one scheduled invocation', async () => {
    const purge = vi
      .fn()
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => `a_${index}`))
      .mockResolvedValueOnce(Array.from({ length: 50 }, (_, index) => `b_${index}`))
      .mockResolvedValueOnce(['last_1', 'last_2']);
    const response = await createPurgeSharedSpacesHandler(purge)();
    expect(purge).toHaveBeenCalledTimes(3);
    expect(JSON.parse(response.body)).toEqual({ purged: 102, remaining: false });
  });
});
