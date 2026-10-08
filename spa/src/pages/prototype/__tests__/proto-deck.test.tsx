/**
 * The deck counts the cards that actually rendered, shows one at a time, and keeps its place
 * when cards come and go underneath it.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ProtoDeck, { DECK_SHOW_EVENT } from '../ProtoDeck';

/*
 * jsdom has no PointerEvent, so `fireEvent.pointerUp` dispatches a bare Event with no clientX,
 * pointerType or pointerId — and a swipe test written against that passes on NaN arithmetic.
 * A MouseEvent with the two pointer fields is enough for what the deck reads.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = TestPointerEvent;
}

function Hidden() {
  return null;
}

function visibleCards(container: HTMLElement): string[] {
  return [...container.querySelectorAll('.proto-deck__track > *')]
    .filter((el) => !el.hasAttribute('data-deck-off'))
    .map((el) => el.textContent ?? '');
}

describe('ProtoDeck', () => {
  it('counts only the cards that rendered', () => {
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button">A</button>
        <Hidden />
        {null}
        <>
          <button type="button">B</button>
          <button type="button">C</button>
        </>
      </ProtoDeck>,
    );
    expect(container.querySelector('.proto-deck')?.getAttribute('data-count')).toBe('3');
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });

  it('shows one card at a time and keeps the rest out of reach', () => {
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button">A</button>
        <button type="button">B</button>
      </ProtoDeck>,
    );
    expect(visibleCards(container)).toEqual(['A']);
    const hidden = container.querySelector<HTMLElement>('[data-deck-off]')!;
    expect(hidden.textContent).toBe('B');
    expect(hidden.inert).toBe(true);
  });

  it('wraps around with the pager', () => {
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button">A</button>
        <button type="button">B</button>
      </ProtoDeck>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next in Up next' }));
    expect(visibleCards(container)).toEqual(['B']);
    fireEvent.click(screen.getByRole('button', { name: 'Next in Up next' }));
    expect(visibleCards(container)).toEqual(['A']);
    fireEvent.click(screen.getByRole('button', { name: 'Previous in Up next' }));
    expect(visibleCards(container)).toEqual(['B']);
    expect(screen.getByText('2 of 2')).toBeTruthy();
  });

  it('cycles with the arrow keys, and leaves typing alone', () => {
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button">A</button>
        <div>
          <input aria-label="field" />
        </div>
      </ProtoDeck>,
    );
    fireEvent.keyDown(screen.getByText('A'), { key: 'ArrowRight' });
    expect(container.querySelector('.proto-deck__track > :not([data-deck-off]) input')).not.toBeNull();
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'ArrowRight' });
    expect(container.querySelector('.proto-deck__track > :not([data-deck-off]) input')).not.toBeNull();
  });

  it('holds its place when the card in front goes', () => {
    function Removable() {
      const [cards, setCards] = useState(['A', 'B', 'C']);
      return (
        <>
          <button type="button" onClick={() => setCards((list) => list.filter((c) => c !== 'B'))}>
            remove B
          </button>
          <ProtoDeck label="Up next">
            {cards.map((card) => (
              <button key={card} type="button" data-deck-id={card}>
                {card}
              </button>
            ))}
          </ProtoDeck>
        </>
      );
    }
    const { container } = render(<Removable />);
    fireEvent.click(screen.getByRole('button', { name: 'Next in Up next' }));
    expect(visibleCards(container)).toEqual(['B']);
    fireEvent.click(screen.getByText('remove B'));
    // B was second; the deck stays second rather than jumping back to the first card.
    expect(visibleCards(container)).toEqual(['C']);
  });

  it('follows a card by its id when the order changes', () => {
    function Reorder() {
      const [cards, setCards] = useState(['A', 'B', 'C']);
      return (
        <>
          <button type="button" onClick={() => setCards(['C', 'A', 'B'])}>
            reorder
          </button>
          <ProtoDeck label="Up next">
            {cards.map((card) => (
              <button key={card} type="button" data-deck-id={card}>
                {card}
              </button>
            ))}
          </ProtoDeck>
        </>
      );
    }
    const { container } = render(<Reorder />);
    fireEvent.click(screen.getByRole('button', { name: 'Next in Up next' }));
    expect(visibleCards(container)).toEqual(['B']);
    fireEvent.click(screen.getByText('reorder'));
    expect(visibleCards(container)).toEqual(['B']);
  });

  it('has no pager for a single card, and hides itself with none', () => {
    const { container, rerender } = render(
      <ProtoDeck label="Review">
        <div>Only</div>
      </ProtoDeck>,
    );
    expect(screen.queryByRole('button', { name: /Next in/ })).toBeNull();
    rerender(
      <ProtoDeck label="Review">
        <Hidden />
      </ProtoDeck>,
    );
    expect(container.querySelector('.proto-deck')?.getAttribute('data-count')).toBe('0');
  });

  it('reports the card in front by its id', () => {
    const onActiveChange = vi.fn();
    render(
      <ProtoDeck label="Up next" onActiveChange={onActiveChange}>
        <button type="button" data-deck-id="first">A</button>
        <button type="button" data-deck-id="second">B</button>
      </ProtoDeck>,
    );
    expect(onActiveChange).toHaveBeenLastCalledWith('first');
    fireEvent.click(screen.getByRole('button', { name: 'Next in Up next' }));
    expect(onActiveChange).toHaveBeenLastCalledWith('second');
  });

  it('turns on a swipe and swallows the tap that ends it', () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button" onClick={onOpen}>
          A
        </button>
        <button type="button">B</button>
      </ProtoDeck>,
    );
    const track = container.querySelector('.proto-deck__track')!;
    fireEvent.pointerDown(track, { pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 10 });
    fireEvent.pointerUp(track, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 14 });
    fireEvent.click(screen.getByText('A'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(visibleCards(container)).toEqual(['B']);
  });

  it('ignores a mostly-vertical drag, which is a scroll', () => {
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button">A</button>
        <button type="button">B</button>
      </ProtoDeck>,
    );
    const track = container.querySelector('.proto-deck__track')!;
    fireEvent.pointerDown(track, { pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 10 });
    fireEvent.pointerUp(track, { pointerType: 'touch', pointerId: 1, clientX: 150, clientY: 200 });
    expect(visibleCards(container)).toEqual(['A']);
  });

  it('brings a card forward when something inside it asks', () => {
    const { container } = render(
      <ProtoDeck label="Up next">
        <button type="button">A</button>
        <div>
          <span id="anchor">B</span>
        </div>
      </ProtoDeck>,
    );
    act(() => {
      document.getElementById('anchor')!.dispatchEvent(new Event(DECK_SHOW_EVENT, { bubbles: true }));
    });
    expect(visibleCards(container)).toEqual(['B']);
  });
});
