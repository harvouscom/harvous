/**
 * Source-contract tests for the room's member-facing "coming up" read.
 *
 * The invariant that matters is which gate it runs and what it refuses to say:
 * this is the one space-plan endpoint a non-staff member may call, so it must
 * not leak the staff plan's surface area on the way.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const comingUpRoute = () => {
  const text = source('server/routes/church-space-plan.ts');
  const start = text.indexOf("app.get('/api/church/spaces/:spaceId/coming-up'");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('export default app;', start);
  return text.slice(start, end > start ? end : undefined);
};

describe('GET /api/church/spaces/:spaceId/coming-up', () => {
  it('gates on membership, never on the staff plan capability', () => {
    const block = comingUpRoute();
    expect(block).toContain('requireSpaceAccess');
    // assertCanViewSpaceTeachingPlan is `sermon_tools` — using it here would
    // put the card back to staff-only, which is the thing this endpoint exists
    // to undo.
    expect(block).not.toContain('assertCanViewSpaceTeachingPlan');
    expect(block).not.toContain('assertCanManageSpaceTeachingPlan');
  });

  it('answers a non-member the same way as a room with no plan', () => {
    // Distinguishing them would turn this into a probe for which rooms exist.
    const block = comingUpRoute();
    const catchArm = block.slice(block.indexOf('} catch {'));
    expect(catchArm.slice(0, 200)).toContain('gathering: null');
  });

  it('says nothing for a ministry channel', () => {
    expect(comingUpRoute()).toContain('isMinistryBroadcastSpaceRow');
  });

  it('never answers with an undated backlog idea', () => {
    expect(comingUpRoute()).toContain('isNotNull(ChurchServices.serviceDate)');
  });

  it("resolves only the viewer's own note, never the room's", () => {
    const block = comingUpRoute();
    expect(block).toContain('resolveViewerServiceNotes(');
    expect(block).toContain('auth.userId');
    // A count or a roster of who else wrote would be the first church-facing
    // read of note lineage — see the helper's docblock.
    expect(block).not.toMatch(/viewerNoteIds|noteCount|writers/);
  });

  it('sends no staff-only scaffolding — resources or colleagues\' drafts', () => {
    const block = comingUpRoute();
    expect(block).not.toContain('attachmentsByServiceIds');
    expect(block).not.toContain('resolveViewerPlannedNotes');
  });
});

describe('the space dashboard', () => {
  it('asks in any room that can hold a plan, not behind thread rights', () => {
    const text = source('spa/src/pages/prototype/PrototypeSidebarSharedSpaceView.tsx');
    const call = text.slice(
      text.indexOf('<PrototypeSpaceComingUp'),
      text.indexOf('<PrototypeSpaceComingUp') + 260,
    );
    /* Was `ministryMeta.orgId` — a church condition that predated churchless
       plans. Any non-personal room can hold one now, and the endpoint behind
       this was only ever gated on membership. */
    expect(call).toContain("ministryMeta.type !== 'personal'");
    expect(call).not.toContain('canManageThreads');
  });
});
