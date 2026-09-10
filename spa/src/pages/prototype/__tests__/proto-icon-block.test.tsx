import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtoIconBlock from '../ProtoIconBlock';

describe('ProtoIconBlock', () => {
  /*
   * The rule this file exists to keep. A bare `+` was once removed from the Review card for
   * being "two entry points for one action, one of them a bare icon", and a glyph meaning
   * "fewer of these" has no settled shape at all — so a block without a word is a question the
   * reader has to answer before they can answer the question. Rules like that survive in code
   * only if something fails when they are broken.
   */
  it('always shows a word beside the glyph', () => {
    render(<ProtoIconBlock icon="thumbs-down" label="Not helpful" onSelect={() => {}} />);
    expect(screen.getByText('Not helpful')).toBeTruthy();
  });

  it('keeps the visible word as the accessible name when it needs no lengthening', () => {
    render(<ProtoIconBlock icon="thumbs-up" label="Good question" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Good question' })).toBeTruthy();
  });

  it('lets a longer sentence be the accessible name where the word is a shortening', () => {
    render(
      <ProtoIconBlock
        icon="eye-slash"
        label="Remove"
        ariaLabel="Remove from Review"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove from Review' })).toBeTruthy();
  });

  it('says which way it was pressed, and only once it has been', () => {
    const { rerender } = render(
      <ProtoIconBlock icon="thumbs-up" label="Good question" onSelect={() => {}} />,
    );
    // No `aria-pressed` at all where the block is an action rather than a choice.
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBeNull();
    rerender(
      <ProtoIconBlock icon="thumbs-up" label="Good question" selected onSelect={() => {}} />,
    );
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('does not fire when spent', () => {
    const onSelect = vi.fn();
    render(<ProtoIconBlock icon="thumbs-up" label="Good question" disabled onSelect={onSelect} />);
    screen.getByRole('button').click();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
