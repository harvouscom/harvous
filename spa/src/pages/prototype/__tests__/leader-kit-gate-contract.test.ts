/**
 * The leader kit stays with leaders, on the client too. Source assertions in the style of
 * thread-plan-completion-contract: what must not happen is a member's session asking for it, or a
 * member seeing the control.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const drilldown = () => withoutComments(source('spa/src/pages/prototype/PrototypeSharedThreadDrilldown.tsx'));

describe('leader kit on the client', () => {
  it('is only fetched for someone who can manage the plan', () => {
    expect(drilldown()).toContain('useStudyPlanLeaderKit(thread.id, { enabled: canManageSequence && isSequence })');
    // The hook itself defaults to off: nothing fetches it without being told to.
    expect(source('spa/src/hooks/queries/useStudyPlanLeaderKit.ts')).toContain('options?.enabled === true');
  });

  it('draws the guide control and sheet only inside the manager’s branch', () => {
    const text = drilldown();
    const control = text.indexOf("onClick={() => setGuideStep({ id: note.id, title: noteTitle(note) })}");
    const branch = text.lastIndexOf('{isSequence && canManageSequence ? (', control);
    expect(control).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(-1);
    const sheet = text.indexOf('<PrototypeStepLeaderGuideSheet');
    expect(text.slice(text.lastIndexOf('{canManageSequence ? (', sheet), sheet)).toContain('canManageSequence');
  });
});

describe('agenda on the client', () => {
  it('the room card offers it only to leaders of a group', () => {
    const hub = withoutComments(source('spa/src/pages/prototype/PrototypeSpaceHub.tsx'));
    expect(hub).toContain("canLead={canManageThreads && ministryMeta.type === 'shared'}");
    const card = withoutComments(source('spa/src/pages/prototype/PrototypeSpaceComingUp.tsx'));
    expect(card).toContain('canLead = false');
    expect(card).toContain('{canLead && spaceId ? (');
  });
});
