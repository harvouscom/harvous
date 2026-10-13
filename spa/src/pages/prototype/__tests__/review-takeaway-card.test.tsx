/**
 * The Takeaway card: bring it to mind, open the note, then say how it went.
 *
 * The order is the whole design. Verdicts on screen before the note is open would be rating a
 * guess, so they are not rendered until "Open my note" has been tapped; and a note card never
 * offers a typing box — writing from memory is for Scripture.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TakeawayCard } from '../review-exercises/TakeawayCard';

function renderCard() {
  const onOpenNote = vi.fn();
  const onVerdict = vi.fn();
  const onPrefetch = vi.fn();
  render(
    <TakeawayCard
      task="What did you take from Adoption, not slavery?"
      onPrefetch={onPrefetch}
      onOpenNote={onOpenNote}
      onVerdict={onVerdict}
    />,
  );
  return { onOpenNote, onVerdict, onPrefetch };
}

describe('TakeawayCard', () => {
  it('asks first, with one way to check and no verdicts yet', () => {
    const { onPrefetch } = renderCard();
    expect(screen.getByText('What did you take from Adoption, not slavery?')).toBeInTheDocument();
    expect(screen.getByText('Bring it to mind first, then check.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open my note' })).toBeInTheDocument();
    for (const label of ['Got it now', 'I almost had it', 'I recalled it']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
    // The note is warmed before it is asked for.
    expect(onPrefetch).toHaveBeenCalledTimes(1);
  });

  it('never offers a typing box', () => {
    renderCard();
    expect(document.querySelector('textarea, input')).toBeNull();
  });

  it('opens the note, then offers the three verdicts', () => {
    const { onOpenNote, onVerdict } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Open my note' }));
    expect(onOpenNote).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Open my note' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Got it now' }));
    fireEvent.click(screen.getByRole('button', { name: 'I almost had it' }));
    fireEvent.click(screen.getByRole('button', { name: 'I recalled it' }));
    expect(onVerdict.mock.calls.map(([outcome]) => outcome)).toEqual(['revealed', 'almost', 'recalled']);
  });

  it('keeps every button gray: the accent is not for a self-rating', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Open my note' }));
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('proto-settings-btn--secondary');
    }
  });
});

describe('the dock asks it', () => {
  const dock = readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/PrototypeReviewDock.tsx'), 'utf8');

  it('renders the Takeaway card ahead of the note-choice card', () => {
    const takeaway = dock.indexOf("item.promptKey === 'note.takeaway'");
    const choice = dock.indexOf(') : noteChoice ? (');
    expect(takeaway).toBeGreaterThan(0);
    expect(takeaway).toBeLessThan(choice);
  });

  it('records the reader\'s verdict with no graded payload, and keeps the dock open on the note', () => {
    const branch = dock.slice(dock.indexOf("item.promptKey === 'note.takeaway'"), dock.indexOf(') : noteChoice ? ('));
    expect(branch).toContain('onVerdict={(value) => answer(value)}');
    expect(branch).toContain('prototypeNoteRouteTo()');
    expect(branch).not.toContain('setReviewDockExpanded(false)');
    expect(branch).not.toContain('closeReviewDock');
  });

  it('has no folder question left to draw', () => {
    expect(dock).not.toContain('note.folder');
  });
});
