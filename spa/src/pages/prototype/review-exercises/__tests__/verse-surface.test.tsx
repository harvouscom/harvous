/**
 * The verse-surface pieces help and never mark. The tiles compare a written word only with the
 * first letter already on the card, the ticks count and never read, and the highlighter paints
 * what is pointed at. Every verdict stays the server's.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InitialsTiles, MarkedExercise, phraseRange, plainVerse, WordTicks } from '../VerseSurface';

const tiles = (container: HTMLElement) => Array.from(container.querySelectorAll('.rx-initial'));

describe('InitialsTiles', () => {
  it('shows each first letter until a word is written for it, then the word', () => {
    const { container } = render(<InitialsTiles initials="T L i m s; I s n w." typed="The Lord is" />);
    const all = tiles(container);
    expect(all).toHaveLength(9);
    expect(all.slice(0, 3).map((t) => t.textContent)).toEqual(['The', 'Lord', 'is']);
    expect(all[3].textContent).toBe('m');
    // The next one to write is outlined.
    expect(all[3].hasAttribute('data-current')).toBe(true);
  });

  it('keeps the skeleton’s punctuation on a written word', () => {
    const { container } = render(<InitialsTiles initials="T L i m s; I" typed="the lord is my shepherd" />);
    expect(tiles(container)[4].textContent).toBe('shepherd;');
  });

  it('shows a word off when it does not start with its tile’s letter, and marks nothing else', () => {
    const { container } = render(<InitialsTiles initials="T L i m s" typed="The Lamb is" />);
    const all = tiles(container);
    // "Lamb" starts with L, which is all the card knows: not shown off.
    expect(all[1].hasAttribute('data-off')).toBe(false);
    const { container: lost } = render(<InitialsTiles initials="T L i m s" typed="The is my" />);
    expect(tiles(lost)[1].hasAttribute('data-off')).toBe(true);
  });
});

describe('WordTicks', () => {
  it('fills one tick per word written, never past the total', () => {
    const { container, rerender } = render(<WordTicks total={4} typed="" />);
    const filled = () => container.querySelectorAll('.rx-tick[data-filled]').length;
    expect(container.querySelectorAll('.rx-tick')).toHaveLength(4);
    expect(filled()).toBe(0);
    rerender(<WordTicks total={4} typed="through Christ who" />);
    expect(filled()).toBe(3);
    rerender(<WordTicks total={4} typed="through Christ who strengthens me always" />);
    expect(filled()).toBe(4);
  });
});

describe('phraseRange and plainVerse', () => {
  it('finds an option’s words in the verse loosely, and not at all when they are not there', () => {
    const verse = 'The LORD is my shepherd; I shall not want.';
    expect(phraseRange(verse, 'is my  shepherd;')).toEqual([9, 24]);
    expect(phraseRange(verse, 'green pastures')).toBeNull();
    expect(phraseRange(verse, null)).toBeNull();
  });

  it('reads the verse off its markup without the verse number', () => {
    expect(plainVerse('<sup class="verse-num">1</sup>The LORD is my&nbsp;shepherd;')).toBe('The LORD is my shepherd;');
  });
});

describe('MarkedExercise', () => {
  const verse = 'The LORD is my shepherd; I shall not want.';
  const options = ['The LORD is my', 'I shall not want.', 'my shepherd; I'];

  it('paints the words an option stands for while it is pointed at', () => {
    const { container } = render(
      <MarkedExercise
        task="Pick the words you marked in Psalm 23:1."
        verse={verse}
        options={options}
        disabled={false}
        missed={[]}
        correct={null}
        pending={null}
        wrong={null}
        missedNow={false}
        onPick={() => {}}
      />,
    );
    expect(container.querySelector('.rx-mark')).toBeNull();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'I shall not want.' }));
    const mark = container.querySelector('.rx-mark')!;
    expect(mark.textContent).toBe('I shall not want.');
    expect(mark.getAttribute('data-state')).toBe('preview');
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'I shall not want.' }));
    expect(container.querySelector('.rx-mark')).toBeNull();
  });

  it('holds the pick painted as picked, and answers with the option itself', () => {
    const onPick = vi.fn();
    const { container, rerender } = render(
      <MarkedExercise
        task="t"
        verse={verse}
        options={options}
        disabled={false}
        missed={[]}
        correct={null}
        pending={null}
        wrong={null}
        missedNow={false}
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'The LORD is my' }));
    expect(onPick).toHaveBeenCalledWith('The LORD is my');
    rerender(
      <MarkedExercise
        task="t"
        verse={verse}
        options={options}
        disabled
        missed={[]}
        correct={null}
        pending="The LORD is my"
        wrong={null}
        missedNow={false}
        onPick={onPick}
      />,
    );
    expect(container.querySelector('.rx-mark')!.getAttribute('data-state')).toBe('picked');
  });
});
