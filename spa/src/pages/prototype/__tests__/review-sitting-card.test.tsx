/**
 * The sitting card at the head of Review on Activity, and the two decisions behind it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrototypeReviewSittingCard from '../PrototypeReviewSittingCard';
import { nextSittingAt, pickSittingHead } from '../review-sitting-head';
import type { ReviewItemView } from '../../../hooks/queries/useReview';

function item(id: string, overrides: Partial<ReviewItemView> = {}): ReviewItemView {
  return {
    id,
    kind: 'note',
    prompt: `Question ${id}`,
    task: 'Pick a passage you cited',
    exercise: { id: 'choice', label: 'Choose', icon: 'list', typed: false },
    framing: null,
    promptKey: 'note.passage',
    recallState: 'fragile',
    status: 'active',
    origin: 'user',
    dueAt: new Date().toISOString(),
    reviewCount: 1,
    ladderStep: 1,
    noteTitle: 'Adoption, not slavery',
    secondaryNoteTitle: null,
    noteLabel: null,
    noteContext: null,
    noteWrittenAt: null,
    scriptureReference: 'Romans 8:15',
    noteId: 'note_1',
    challengeId: null,
    sourceLabel: null,
    sourceAt: null,
    cue: null,
    translation: 'NET',
    ...overrides,
  };
}

describe('which question the card asks', () => {
  it('asks what the dock will open first, when it is also on the shelf', () => {
    const head = pickSittingHead([item('b'), item('a')], [item('a'), item('b')]);
    expect(head?.id).toBe('b');
  });

  it('skips a session question the shelf no longer offers', () => {
    // Answered, or dropped from today — the frozen session still lists it, the inbox does not.
    const head = pickSittingHead([item('gone'), item('a')], [item('a'), item('b')]);
    expect(head?.id).toBe('a');
  });

  it('never leads with a second look at something just missed', () => {
    const head = pickSittingHead([item('a', { practice: true }), item('b')], [item('a'), item('b')]);
    expect(head?.id).toBe('b');
  });

  it('falls back to the shelf before the session has loaded', () => {
    expect(pickSittingHead(undefined, [item('a'), item('b')])?.id).toBe('a');
    expect(pickSittingHead(undefined, [])).toBeNull();
  });

  it('renders the session’s own copy of the question, built for the rung it will be asked on', () => {
    const head = pickSittingHead([item('a', { prompt: 'As the dock will ask it' })], [item('a')]);
    expect(head?.prompt).toBe('As the dock will ask it');
  });
});

describe('when there will be more', () => {
  const noon = new Date(2026, 9, 2, 12, 0, 0).getTime();
  const at = (hours: number) => new Date(noon + hours * 3_600_000).toISOString();

  it('never says later today once the day is spent', () => {
    const next = nextSittingAt([{ dueAt: at(2) }], noon);
    expect(new Date(next!).getHours()).toBe(0);
    expect(new Date(next!).getDate()).toBe(3);
  });

  it('names the later day when nothing falls due before it', () => {
    const next = nextSittingAt([{ dueAt: at(72) }, { dueAt: at(30) }], noon);
    expect(next).toBe(at(30));
  });

  it('says nothing when nothing is scheduled', () => {
    expect(nextSittingAt([], noon)).toBeNull();
    expect(nextSittingAt(null, noon)).toBeNull();
  });
});

describe('the card', () => {
  it('asks the question under what it is about, with one way in', () => {
    const onBegin = vi.fn();
    render(
      <PrototypeReviewSittingCard
        head={item('a', { prompt: 'Pick a passage you cited in Adoption, not slavery.' })}
        today={{ answered: 0, goal: 5 }}
        nextReturn={null}
        onBegin={onBegin}
      />,
    );
    expect(screen.getByText('Adoption, not slavery · Choose')).toBeInTheDocument();
    expect(screen.getByText('Pick a passage you cited in Adoption, not slavery.')).toBeInTheDocument();
    expect(screen.getByText('0 of 5 today')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Begin' }).click();
    expect(onBegin).toHaveBeenCalledWith('a');
  });

  it('says Keep going once today has been started', () => {
    render(
      <PrototypeReviewSittingCard
        head={item('a')}
        today={{ answered: 2, goal: 5 }}
        nextReturn={null}
        onBegin={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Keep going' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('shows no bar for a sitting of one', () => {
    render(
      <PrototypeReviewSittingCard
        head={item('a')}
        today={{ answered: 0, goal: 1 }}
        nextReturn={null}
        onBegin={() => {}}
      />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('ends the day with a full stop and when there will be more, and nothing to press', () => {
    render(
      <PrototypeReviewSittingCard
        head={null}
        today={{ answered: 5, goal: 5 }}
        nextReturn="tomorrow"
        onBegin={() => {}}
      />,
    );
    expect(screen.getByText("That's today's sitting")).toBeInTheDocument();
    expect(screen.getByText('More tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('never counts what is left', () => {
    const { container } = render(
      <PrototypeReviewSittingCard
        head={item('a')}
        today={{ answered: 3, goal: 8 }}
        nextReturn={null}
        onBegin={() => {}}
      />,
    );
    expect(container.textContent).not.toMatch(/remaining|left|overdue/i);
    expect(container.textContent).not.toMatch(/\d+\s*(due|waiting|remaining|overdue)/i);
  });
});
