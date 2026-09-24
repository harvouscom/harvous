/**
 * The illustrated cards draw the answer as the kind of thing it is, and keep every choice's
 * contract: the keys still work, the marking is still the dock's, and only offered things can be
 * picked.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BookShelf, shelfCanHold, SpeakerScene, TagSlotScene } from '../IllustratedScenes';
import { ChoiceOptions, initialsOf } from '../ChoiceOptions';

describe('initialsOf', () => {
  it('takes the first letter and the last capitalised word', () => {
    expect(initialsOf('Saul')).toBe('S');
    expect(initialsOf('John the Baptist')).toBe('JB');
    expect(initialsOf('Mary Magdalene')).toBe('MM');
  });
});

describe('ChoiceOptions variants', () => {
  it('draws a portrait for each person, and keeps the letter keys', () => {
    const onPick = vi.fn();
    const { container } = render(
      <ChoiceOptions options={['Saul', 'David']} variant="portrait" disabled={false} onPick={onPick} />,
    );
    expect(Array.from(container.querySelectorAll('.rx-option__avatar')).map((a) => a.textContent)).toEqual(['S', 'D']);
    fireEvent.keyDown(window, { key: 'b' });
    expect(onPick).toHaveBeenCalledWith('David');
  });

  it('draws each note as a sheet with lines', () => {
    const { container } = render(
      <ChoiceOptions options={['Shepherd psalms', 'Exile']} variant="note" disabled={false} onPick={() => {}} />,
    );
    expect(container.querySelector('.rx-options')!.getAttribute('data-variant')).toBe('note');
    expect(container.querySelectorAll('.rx-option__lines')).toHaveLength(2);
  });
});

describe('BookShelf', () => {
  const options = ['Genesis', 'Psalms', 'Isaiah', 'John'];

  it('holds the whole Bible, and only the offered books can be taken down', () => {
    const { container } = render(<BookShelf options={options} disabled={false} onPick={() => {}} />);
    expect(container.querySelectorAll('.rx-shelf__spine')).toHaveLength(62);
    const books = screen.getAllByRole('button');
    expect(books.map((b) => b.getAttribute('aria-label'))).toEqual(['Genesis', 'Psalms', 'Isaiah', 'John']);
  });

  it('answers with the book tapped, or the one its letter names', () => {
    const onPick = vi.fn();
    render(<BookShelf options={['Psalms', 'Genesis', 'John', 'Isaiah']} disabled={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'John' }));
    expect(onPick).toHaveBeenLastCalledWith('John');
    // Keys follow the options' order, not the shelf's: B is the second option, Genesis.
    fireEvent.keyDown(window, { key: 'B' });
    expect(onPick).toHaveBeenLastCalledWith('Genesis');
  });

  it('marks a spent book and will not take it down again', () => {
    render(<BookShelf options={options} disabled={false} missed={['Isaiah']} onPick={() => {}} />);
    const isaiah = screen.getByRole('button', { name: 'Isaiah' }) as HTMLButtonElement;
    expect(isaiah.getAttribute('data-state')).toBe('wrong');
    expect(isaiah.disabled).toBe(true);
  });

  it('only stands in for books it knows', () => {
    expect(shelfCanHold(['Genesis', 'Psalms'])).toBe(true);
    expect(shelfCanHold(['Genesis', 'Psalm 23'])).toBe(false);
    expect(shelfCanHold([])).toBe(false);
  });
});

describe('SpeakerScene and TagSlotScene', () => {
  it('keeps the portrait a question until something is tapped, then shows whose it is', () => {
    const { container, rerender } = render(<SpeakerScene quote={<p>Thou comest to me…</p>} fill={null} />);
    expect(container.querySelector('.rx-speaker__portrait')!.textContent).toBe('?');
    rerender(<SpeakerScene quote={<p>Thou comest to me…</p>} fill={{ text: 'David', state: 'wrong' }} />);
    const portrait = container.querySelector('.rx-speaker__portrait')!;
    expect(portrait.textContent).toBe('D');
    expect(portrait.getAttribute('data-state')).toBe('wrong');
  });

  it('labels the empty tag with the kind of answer, never the answer', () => {
    const { container } = render(
      <TagSlotScene icon="location-dot" label="A place it names" fill={null}>
        <p>And Joseph also went up…</p>
      </TagSlotScene>,
    );
    expect(container.querySelector('.rx-tagslot')!.textContent).toBe('A place it names');
  });
});
