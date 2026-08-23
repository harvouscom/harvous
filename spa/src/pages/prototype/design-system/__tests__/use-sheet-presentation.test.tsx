/**
 * The presentation decision, and the reason it is a hook rather than a line.
 *
 * Fifteen overlays each read `matchMedia('(pointer: coarse)')` during render and never
 * subscribed, so the answer froze at first render. The reactivity test below is the one that
 * would have caught that; the rest pin the rule itself.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useSheetPresentation } from '../useSheetPresentation';

let isMobileSidebar = true;
vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ isMobileSidebar }),
}));

/** A controllable `(pointer: coarse)` that actually notifies its listeners. */
const listeners = new Set<() => void>();
let coarse = true;
function setCoarse(next: boolean) {
  coarse = next;
  act(() => listeners.forEach((fn) => fn()));
}

beforeEach(() => {
  listeners.clear();
  coarse = true;
  isMobileSidebar = true;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('coarse') ? coarse : false,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }),
  });
});

function Probe() {
  const { asSheet, asPopover } = useSheetPresentation();
  return <span data-testid="p">{`${asSheet ? 'sheet' : ''}${asPopover ? 'popover' : ''}`}</span>;
}
const shown = () => screen.getByTestId('p').textContent;

describe('useSheetPresentation', () => {
  it('is a sheet on a touch device at the mobile breakpoint', () => {
    render(<Probe />);
    expect(shown()).toBe('sheet');
  });

  it('is a popover on a narrow window driven by a cursor', () => {
    coarse = false;
    render(<Probe />);
    expect(shown()).toBe('popover');
  });

  it('is a popover on a touch device with room for one', () => {
    isMobileSidebar = false;
    render(<Probe />);
    expect(shown()).toBe('popover');
  });

  it('follows the pointer changing under it — an iPad gaining a trackpad', () => {
    render(<Probe />);
    expect(shown()).toBe('sheet');
    setCoarse(false);
    expect(shown()).toBe('popover');
  });

  it('never reports both, or neither', () => {
    render(<Probe />);
    expect(shown()).toBe('sheet');
    setCoarse(false);
    expect(shown()).toBe('popover');
  });
});
