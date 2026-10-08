import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Icon from '../Icon';

/**
 * Font Awesome 7 draws some glyphs past their own viewBox — the padlock's shackle starts above
 * the box — and an inline <svg> clips to its box by default. The renderer has to opt out, or the
 * top of the lock is shaved off wherever it appears.
 */
describe('Icon', () => {
  it('lets a glyph draw past its viewBox', () => {
    const { container } = render(<Icon name="lock" size={15} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('style')).toContain('overflow:visible');
  });

  it('keeps the requested size', () => {
    const { container } = render(<Icon name="ellipsis-vertical" size={14} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('14');
    expect(svg.getAttribute('height')).toBe('14');
  });
});
