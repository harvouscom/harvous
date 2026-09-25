import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { UnbuildableQuestion } from '../UnbuildableQuestion';

describe('UnbuildableQuestion', () => {
  it('skips the question once, however often the dock re-renders it', () => {
    const onSkip = vi.fn();
    const { rerender } = render(<UnbuildableQuestion onSkip={onSkip} label="Loading" />);
    rerender(<UnbuildableQuestion onSkip={onSkip} label="Loading" />);
    rerender(<UnbuildableQuestion onSkip={() => onSkip()} label="Loading" />);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('never shows the reader a prompt with nothing under it', () => {
    const { container } = render(<UnbuildableQuestion onSkip={() => {}} label="Loading" />);
    expect(container.textContent ?? '').not.toMatch(/Check my note/);
  });
});
