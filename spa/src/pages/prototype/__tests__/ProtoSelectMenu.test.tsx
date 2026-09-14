/**
 * `ProtoSelectMenu`, in both of its modes.
 *
 * The single mode is the house picker every "choose one" in the prototype already uses, so its
 * one test here pins that `multiple` did not change it. The multiple mode is Discover's topic
 * filter: ticks that keep the menu open, a first row that clears, and a trigger that says what
 * the filter is without opening it.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import ProtoSelectMenu from '../ProtoSelectMenu';

beforeAll(() => {
  /* jsdom implements neither of these. The open menu scrolls its chosen row into view and
     observes its own box to stay anchored, so without them opening it throws. */
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  /* jsdom lays nothing out, so every box is 0×0 at the top of the page — which the menu reads
     as a trigger scrolled out of view, and closes itself the moment it opens. A box on screen. */
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 20,
    bottom: 50,
    left: 20,
    right: 140,
    width: 120,
    height: 30,
    x: 20,
    y: 20,
    toJSON: () => ({}),
  } as DOMRect);
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
  }
});

const TOPICS = [
  { value: 'journal', label: 'Daily journal' },
  { value: 'sermon', label: 'Sermon notes' },
  { value: 'book', label: 'Book study' },
];

function Topics({ initial = [], onChange }: { initial?: string[]; onChange?: (next: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <ProtoSelectMenu<string>
      multiple
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={TOPICS}
      label="Which topics to show"
      emptyLabel="All topics"
      countLabel={(count) => `${count} topics`}
    />
  );
}

function trigger() {
  return screen.getByRole('button', { name: 'Which topics to show' });
}

/* `fireEvent` rather than `element.click()`: the menu opens on a state update, and only the
   wrapped event flushes it before the next query looks for the rows. */
function tick(name: string) {
  fireEvent.click(screen.getByRole('menuitemcheckbox', { name }));
}

describe('several at once', () => {
  it('says what the filter is from the trigger: all, the one, or how many', () => {
    render(<Topics />);
    expect(trigger().textContent).toContain('All topics');

    fireEvent.click(trigger());
    tick('Sermon notes');
    expect(trigger().textContent).toContain('Sermon notes');

    tick('Book study');
    expect(trigger().textContent).toContain('2 topics');
  });

  it('stays open while you tick, and reports the choice in the menu’s order', () => {
    // Closing after each tick would make three topics three trips to the same menu. The order
    // is the list's, not the clicks', so the same choice always compares equal.
    const onChange = vi.fn();
    render(<Topics onChange={onChange} />);
    fireEvent.click(trigger());
    tick('Book study');
    tick('Daily journal');

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(['journal', 'book']);
  });

  it('unticks a topic that was already chosen', () => {
    const onChange = vi.fn();
    render(<Topics initial={['journal', 'sermon']} onChange={onChange} />);
    fireEvent.click(trigger());
    tick('Daily journal');
    expect(onChange).toHaveBeenLastCalledWith(['sermon']);
  });

  it('clears in one tap from its first row, and closes', () => {
    // Nothing ticked has to mean all of them, and undoing a filter should not be a chore.
    const onChange = vi.fn();
    render(<Topics initial={['sermon']} onChange={onChange} />);
    fireEvent.click(trigger());
    tick('All topics');

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger().textContent).toContain('All topics');
  });
});

describe('one of the list', () => {
  it('still closes on the pick and reports the single value', () => {
    const onChange = vi.fn();
    render(
      <ProtoSelectMenu<string>
        value="journal"
        options={TOPICS}
        onChange={onChange}
        label="Which topic"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Which topic' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Book study' }));

    expect(onChange).toHaveBeenCalledWith('book');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
