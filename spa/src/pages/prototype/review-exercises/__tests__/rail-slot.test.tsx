/**
 * The rail's empty place shows what the tap did — and only that. The page holds no answer key,
 * so what fills the place is derived from the dock's own marking, never guessed.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { OpeningLine, PairRail, Rail, slotFill } from '../RailSlot';
import { trailOff } from '../ChoiceOptions';

describe('slotFill', () => {
  it('shows the tap on its way first, then the mark that came back', () => {
    expect(slotFill({ pending: 'He restores my soul', correct: null, wrong: 'Other' })).toEqual({
      text: 'He restores my soul',
      state: 'picked',
    });
    expect(slotFill({ correct: 'John 10:11' })).toEqual({ text: 'John 10:11', state: 'right' });
    expect(slotFill({ wrong: 'Romans 3:23' })).toEqual({ text: 'Romans 3:23', state: 'wrong' });
  });

  it('is empty until something is tapped', () => {
    expect(slotFill({})).toBeNull();
    expect(slotFill({ pending: null, correct: null, wrong: null })).toBeNull();
  });
});

describe('Rail', () => {
  it('keeps the known item and labels the empty place without naming the answer', () => {
    const { container } = render(
      <Rail fromLabel="Psalm 23:1" from={<p>The LORD is my shepherd</p>} slotLabel="Next verse" fill={null} />,
    );
    expect(container.textContent).toContain('Psalm 23:1');
    expect(container.textContent).toContain('The LORD is my shepherd');
    const slot = container.querySelector('.rx-rail__slot')!;
    expect(slot.textContent).toContain('Next verse');
    expect(slot.hasAttribute('data-filled')).toBe(false);
  });

  it('puts the pick in the place and marks it', () => {
    const { container } = render(
      <Rail
        fromLabel="Psalm 23:1"
        from={<p>The LORD is my shepherd</p>}
        slotLabel="Next verse"
        fill={{ text: 'He makes me lie down', state: 'wrong' }}
        trailing
      />,
    );
    const slot = container.querySelector('.rx-rail__slot')!;
    expect(slot.getAttribute('data-state')).toBe('wrong');
    expect(slot.textContent).toContain('He makes me lie down…');
  });
});

describe('PairRail', () => {
  it('puts the pick first and the other option after it, unmarked', () => {
    const { container } = render(
      <PairRail options={['He restores my soul', 'He makes me lie down']} fill={{ text: 'He makes me lie down', state: 'picked' }} />,
    );
    const [first, then] = Array.from(container.querySelectorAll('.rx-rail__slot'));
    expect(first.textContent).toContain('He makes me lie down…');
    expect(first.getAttribute('data-state')).toBe('picked');
    expect(then.textContent).toContain('He restores my soul…');
    expect(then.getAttribute('data-state')).toBe('placed');
  });

  it('leaves both places open before a tap', () => {
    const { container } = render(<PairRail options={['A', 'B']} fill={null} />);
    for (const slot of Array.from(container.querySelectorAll('.rx-rail__slot'))) {
      expect(slot.hasAttribute('data-filled')).toBe(false);
    }
  });
});

describe('OpeningLine', () => {
  it('gives the reference and a gap, never the rest of the verse', () => {
    const { container } = render(<OpeningLine reference="Philippians 4:13" fill={null} />);
    expect(container.textContent).toContain('Philippians 4:13');
    expect(container.querySelector('.rx-opening')!.hasAttribute('data-filled')).toBe(false);
  });
});

describe('trailOff', () => {
  it('trails off once, never after a stop the clause already had', () => {
    expect(trailOff('And this hope will not lead to disappointment.')).toBe('And this hope will not lead to disappointment…');
    expect(trailOff('He restores my soul')).toBe('He restores my soul…');
    expect(trailOff('For God so loved the world, ')).toBe('For God so loved the world…');
  });
});
