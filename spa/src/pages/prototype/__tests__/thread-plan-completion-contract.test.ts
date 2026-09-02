/**
 * The two completions, held apart on the client.
 *
 * The server keeps them in different tables and a route-source contract holds
 * that line (`server/routes/__tests__/study-plan-completion.test.ts`). This is
 * the same line one layer up, where it is easier to lose: both controls are
 * about "done", they render on the same screen, and the tempting simplification
 * is to put the member's inside the manager's gate — which would mean nobody
 * but a leader could ever say they finished.
 *
 * Asserted against the source, in the style of shared-thread-loop-contract,
 * because what must not happen is a gate *appearing*.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const progress = () => withoutComments(source('spa/src/pages/prototype/PrototypeThreadPlanProgress.tsx'));
const drilldown = () =>
  withoutComments(source('spa/src/pages/prototype/PrototypeSharedThreadDrilldown.tsx'));

describe('finishing a plan is not a manager’s privilege', () => {
  it('the progress row takes no role at all', () => {
    /*
      Not "does not check the role" — it cannot, because none reaches it. A
      component that never receives the answer cannot be quietly gated on it.
    */
    const text = progress();
    expect(text).not.toContain('isOwner');
    expect(text).not.toContain('canManage');
    expect(text).not.toContain('membershipRole');
  });

  it('is not rendered inside the manager’s branch in the drilldown', () => {
    const text = drilldown();
    const start = text.indexOf('<PrototypeThreadPlanProgress');
    expect(start).toBeGreaterThan(-1);
    /* The nearest gate above it must be the sequence/step one, not a role one —
       `canManageSequence` guards the menu that holds "Close this run". */
    const before = text.slice(Math.max(0, start - 400), start);
    expect(before).not.toContain('canManageSequence');
  });

  it('never refuses because the room closed the run', () => {
    // Closed is a label, not a lock: people finish late, and the route has no
    // closed check either.
    expect(progress()).not.toContain('closedAt');
    expect(progress()).not.toContain('runClosed');
  });
});

describe('the member’s finish and the leader’s close stay separate calls', () => {
  it('the progress row reaches only for the member’s own route', () => {
    const text = progress();
    expect(text).toContain('useCompleteThreadPlan');
    expect(text).not.toContain('useCloseThreadRun');
  });

  it('each hook posts to its own endpoint', () => {
    const complete = source('spa/src/hooks/mutations/useCompleteThreadPlan.ts');
    const close = source('spa/src/hooks/mutations/useCloseThreadRun.ts');
    expect(complete).toContain('/complete');
    expect(withoutComments(complete)).not.toContain('/close');
    expect(close).toContain('/close');
    expect(withoutComments(close)).not.toContain('/complete');
  });

  it('completion is always sent as an explicit boolean', () => {
    /*
      The server rejects an absent key rather than toggling silently, because
      "actually, not yet" is a thing a person says. The hook must therefore
      always carry one — a partial body would surface as a 400 at the moment
      someone tries to take a claim back.
    */
    expect(withoutComments(source('spa/src/hooks/mutations/useCompleteThreadPlan.ts'))).toContain(
      'completed: boolean',
    );
  });
});
