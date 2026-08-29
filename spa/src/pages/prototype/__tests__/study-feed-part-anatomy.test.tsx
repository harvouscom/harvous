/**
 * "What varies inside the panel is weight, not layout" — the section's own docblock.
 *
 * It was varying layout too. A written moment rendered with no icon tile, so its text began
 * 37px to the left of every neighbouring row and the panel's left edge zigzagged down the
 * day. These assertions are about the part that must not drift back: both kinds of moment
 * wear the same tile and the same title face, and only the written one keeps its words.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { StudyFeedItem, StudyFeedPartGroup } from '@/utils/study-feed-items';
import PrototypeStudyFeedPart from '../PrototypeStudyFeedPart';

const wrote: StudyFeedItem = {
  id: 'note-created:n1',
  kind: 'note-created',
  at: '2026-08-28T14:59:00.000Z',
  noteId: 'n1',
  title: 'This is great',
  snippet: 'Now does this work and can it show me about Paul?',
  scriptureRefs: [],
};

const quoted: StudyFeedItem = {
  id: 'highlight-scripture:h1',
  kind: 'highlight-scripture',
  at: '2026-08-28T08:24:00.000Z',
  excerpt: 'There is now no condemnation',
  reference: 'Romans 8:1',
} as StudyFeedItem;

const went: StudyFeedItem = {
  id: 'note-revisited:n2',
  kind: 'note-revisited',
  at: '2026-08-28T15:03:00.000Z',
  noteId: 'n2',
  title: 'Romans 8',
} as StudyFeedItem;

function renderPart(items: StudyFeedItem[]) {
  const group: StudyFeedPartGroup = { part: 'afternoon', label: 'This afternoon', items };
  return render(<PrototypeStudyFeedPart group={group} onOpen={vi.fn()} />);
}

describe('the two kinds of moment', () => {
  it('all wear the row icon tile, so the panel has one left edge', () => {
    // The quoted kind counts: it is the other half of "something made", and leaving it
    // unaligned would have fixed half a zigzag.
    const { container } = renderPart([wrote, quoted, went]);
    expect(container.querySelectorAll('.proto-list-panel__row-icon').length).toBe(3);
  });

  it('start every text column in the same place', () => {
    const { container } = renderPart([wrote, quoted, went]);
    const cols = container.querySelectorAll('.proto-feed-said__col, .proto-list-panel__row-text');
    expect(cols.length).toBe(3);
  });

  it('give their titles the same face', () => {
    const { container } = renderPart([wrote, went]);
    // `pds-list-title` is the app's list-row title. The written moment used to hard-code a
    // heavier, larger one of its own, which is what made it read as a different species.
    expect(container.querySelector('.proto-feed-said__title')?.className).toContain(
      'pds-list-title',
    );
    expect(container.querySelector('.proto-list-panel__row-title')?.className).toContain(
      'pds-list-title',
    );
  });

  it('differ in weight: only what was made keeps its words', () => {
    const { container } = renderPart([wrote, quoted, went]);
    expect(container.querySelector('.proto-feed-said__quote')?.textContent).toContain(
      'no condemnation',
    );
    expect(container.querySelector('.proto-feed-said__body')?.textContent).toContain(
      'Now does this work',
    );
    expect(container.querySelectorAll('.proto-feed-said__body').length).toBe(1);
  });
});
