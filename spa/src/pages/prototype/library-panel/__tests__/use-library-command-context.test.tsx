/**
 * Capturing the command context for a surface that stays open.
 *
 * This is the test that guards the property `prototype-command-context-store`'s header is
 * about: the store publishes a getter because focus moves without re-rendering, and this
 * panel takes focus the moment it opens. If a later read were allowed to overwrite the
 * mount-time answer, Actions would go empty the instant you clicked into the search field.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { CommandContext } from '../../../../lib/prototype-commands';

/** The published record the store hands out, with a getter we can change between calls. */
let getContext: () => CommandContext | null;
let run: ((id: string) => void) | undefined;
let published: { getContext?: () => CommandContext | null; run?: (id: string) => void };

vi.mock('../../../../lib/prototype-command-context-store', () => ({
  usePrototypeCommandContext: () => published,
}));

const { useLibraryCommandContext } = await import('../use-library-command-context');

const CTX = (ids: string[]): CommandContext =>
  ({ selectedIds: ids, kind: 'note' }) as unknown as CommandContext;

function renderHook() {
  const ref: { current: ReturnType<typeof useLibraryCommandContext> | null } = { current: null };
  function Probe() {
    ref.current = useLibraryCommandContext();
    return null;
  }
  render(<Probe />);
  return ref as { current: ReturnType<typeof useLibraryCommandContext> };
}

beforeEach(() => {
  getContext = () => null;
  run = vi.fn();
  published = { getContext: () => getContext(), run: (id: string) => run?.(id) };
});

describe('useLibraryCommandContext', () => {
  it('captures the context standing at mount', () => {
    getContext = () => CTX(['n1', 'n2']);
    const hook = renderHook();
    expect(hook.current.ctx).toEqual(CTX(['n1', 'n2']));
  });

  it('keeps the mount-time context when a later read comes back null', () => {
    // The failure this exists for: the panel's own focus effect moves focus off the row
    // the reader was standing on, so the store legitimately answers null a beat later.
    // That is news about focus, not news that the selection is gone.
    getContext = () => CTX(['n1']);
    const hook = renderHook();
    expect(hook.current.ctx).toEqual(CTX(['n1']));

    act(() => {
      getContext = () => null;
    });
    expect(hook.current.ctx).toEqual(CTX(['n1']));
  });

  it('takes a later non-null read, which can only be an improvement', () => {
    getContext = () => null;
    const hook = renderHook();
    expect(hook.current.ctx).toBeNull();

    // A different list published, or a selection appeared.
    getContext = () => CTX(['n9']);
    const hook2 = renderHook();
    expect(hook2.current.ctx).toEqual(CTX(['n9']));
  });

  it('tolerates a store with no getter at all', () => {
    published = { run: undefined };
    const hook = renderHook();
    expect(hook.current.ctx).toBeNull();
  });

  it('exposes run live rather than snapshotting it', () => {
    // The runner is a handle into whichever list published it; calling a captured one
    // after that list re-published would act through a stale closure.
    getContext = () => CTX(['n1']);
    const hook = renderHook();
    hook.current.run?.('organize.folder');
    expect(run).toHaveBeenCalledWith('organize.folder');
  });
});
