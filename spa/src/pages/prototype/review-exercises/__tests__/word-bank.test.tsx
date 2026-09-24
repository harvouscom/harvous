/**
 * The word-bank cloze: tiles go into gaps, and back out again.
 *
 * The pieces are controlled by the one array the typed cloze uses, so these drive them through a
 * small stateful harness shaped like the dock: a tapped tile fills the first open gap, a tapped
 * gap empties. What is protected is that the tray and the gaps always agree about which tiles are
 * taken — including a word that appears twice, and a word the app filled in after a miss.
 */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { bankUsage, nextOpenGap, WordBankLine, WordTray } from '../WordBank';

const SEGMENTS = ['For God so ', ' the world, that he ', ' his only Son.'];
const LENGTHS = [5, 4];

function Harness({
  bank,
  given = new Map<number, string>(),
  initial = [],
  partState = () => undefined,
}: {
  bank: string[];
  given?: Map<number, string>;
  initial?: string[];
  partState?: (index: number) => 'right' | 'wrong' | undefined;
}) {
  const [values, setValues] = useState<string[]>(() => {
    const start = [...initial];
    for (const [index, word] of given) start[index] = word;
    return start;
  });
  return (
    <>
      <WordBankLine
        hero="lg"
        segments={SEGMENTS}
        blankLengths={LENGTHS}
        values={values}
        given={given}
        partState={partState}
        disabled={false}
        onClear={(index) => setValues((v) => v.map((w, i) => (i === index ? '' : w)))}
      />
      <WordTray
        bank={bank}
        values={values}
        disabled={false}
        onPlace={(word) => {
          const at = nextOpenGap(LENGTHS.length, values, given);
          if (at === null) return;
          setValues((v) => {
            const next = [...v];
            next[at] = word;
            return next;
          });
        }}
      />
      <output data-testid="values">{values.join('|')}</output>
    </>
  );
}

const tray = () => within(screen.getByRole('group', { name: 'Words to place' }));
const values = () => screen.getByTestId('values').textContent;

describe('bankUsage', () => {
  it('takes one tile per placed word, matching loosely, and a repeated word takes a second tile', () => {
    expect(bankUsage(['love', 'gave', 'Love', 'sent'], ['love', 'LOVE'])).toEqual([true, false, true, false]);
    expect(bankUsage(['gave', 'sent'], ['', undefined])).toEqual([false, false]);
    // A word with no tile (typed, or a hint the bank never held) takes nothing.
    expect(bankUsage(['gave'], ['made'])).toEqual([false]);
  });
});

describe('nextOpenGap', () => {
  it('skips gaps that are filled or were given', () => {
    expect(nextOpenGap(3, ['a', '', ''], new Map([[1, 'b']]))).toBe(2);
    expect(nextOpenGap(2, ['a', 'b'], new Map())).toBeNull();
  });
});

describe('placing words', () => {
  it('fills the gaps in order, and the placed tile leaves an outline behind', () => {
    render(<Harness bank={['gave', 'loved', 'sent', 'made']} />);
    fireEvent.click(tray().getByRole('button', { name: 'loved' }));
    fireEvent.click(tray().getByRole('button', { name: 'gave' }));
    expect(values()).toBe('loved|gave');

    // Taken tiles stay in the tray as outlines, out of reach of a pointer or a screen reader.
    expect(tray().queryByRole('button', { name: 'loved' })).toBeNull();
    expect(tray().getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Blank 1: loved, tap to take it back' })).toBeTruthy();
  });

  it('sends a word back to the tray when its gap is tapped', () => {
    render(<Harness bank={['gave', 'loved', 'sent']} />);
    fireEvent.click(tray().getByRole('button', { name: 'loved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank 1: loved, tap to take it back' }));
    expect(values()).toBe('');
    expect(tray().getByRole('button', { name: 'loved' })).toBeTruthy();
  });

  it('does nothing once every gap is full', () => {
    render(<Harness bank={['gave', 'loved', 'sent']} />);
    fireEvent.click(tray().getByRole('button', { name: 'loved' }));
    fireEvent.click(tray().getByRole('button', { name: 'gave' }));
    fireEvent.click(tray().getByRole('button', { name: 'sent' }));
    expect(values()).toBe('loved|gave');
  });

  it('holds a word the app filled in, locked, with its tile taken', () => {
    render(<Harness bank={['gave', 'loved', 'sent']} given={new Map([[0, 'loved']])} />);
    const gap = screen.getByRole('button', { name: 'Blank 1: loved' });
    expect(gap.getAttribute('data-state')).toBe('given');
    expect((gap as HTMLButtonElement).disabled).toBe(true);
    expect(tray().queryByRole('button', { name: 'loved' })).toBeNull();

    // The next tile goes to the gap that is still open.
    fireEvent.click(tray().getByRole('button', { name: 'gave' }));
    expect(values()).toBe('loved|gave');
  });

  it('marks each gap with its own verdict', () => {
    render(
      <Harness
        bank={['gave', 'loved', 'sent']}
        initial={['loved', 'sent']}
        partState={(index) => (index === 0 ? 'right' : 'wrong')}
      />,
    );
    expect(screen.getByRole('button', { name: /^Blank 1: loved/ }).getAttribute('data-state')).toBe('right');
    expect(screen.getByRole('button', { name: /^Blank 2: sent/ }).getAttribute('data-state')).toBe('wrong');
  });
});
