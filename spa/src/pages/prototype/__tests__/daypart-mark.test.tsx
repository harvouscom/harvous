/**
 * "Friday nights" with the hour drawn beside it: the words stay words, each daypart gets its own
 * picture, and two marks on one page never share a clip id.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ProtoDaypartMark, { isDaypart } from '../ProtoDaypartMark';

describe('ProtoDaypartMark', () => {
  it('keeps the words readable as words', () => {
    const { container } = render(<ProtoDaypartMark day="Friday" daypart="nights" />);
    expect(container.textContent).toBe('Friday nights');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws a moon with stars at night and a sun by day', () => {
    const night = render(<ProtoDaypartMark day="Friday" daypart="nights" />).container;
    expect(night.querySelectorAll('.proto-daypart__star')).toHaveLength(2);
    const noon = render(<ProtoDaypartMark day="Friday" daypart="afternoons" />).container;
    expect(noon.querySelector('.proto-daypart__sun--turn')).not.toBeNull();
  });

  it('gives each rendered copy its own horizon clip', () => {
    const { container } = render(
      <>
        <ProtoDaypartMark day="Friday" daypart="evenings" />
        <ProtoDaypartMark day="Sunday" daypart="evenings" />
      </>,
    );
    const ids = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('knows the four dayparts and nothing else', () => {
    expect(['mornings', 'afternoons', 'evenings', 'nights'].every(isDaypart)).toBe(true);
    expect(isDaypart('weekends')).toBe(false);
  });
});
