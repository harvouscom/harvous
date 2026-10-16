/**
 * One map, three owners: My Bible, a space's Our Bible, and a family's — which is book names
 * only, so it must never draw a chapter strip or a chapter count.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverageFromBooks, type BibleCoverage } from '@/utils/bible-coverage';

const mine: { data: BibleCoverage | undefined } = { data: undefined };
const ours: { data: unknown } = { data: undefined };
const share = { mutate: vi.fn(), isPending: false };

vi.mock('../../ProtoSidebarExpandedPanel', () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => (
    <section aria-label={title}>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}));
vi.mock('../../ProtoSpaceLoading', () => ({ default: ({ label }: { label: string }) => <p>{label}</p> }));
vi.mock('../../../../hooks/queries/useBibleCoverage', () => ({ useBibleCoverage: () => mine }));
vi.mock('../../../../hooks/queries/useSpaceBibleCoverage', () => ({
  useSpaceBibleCoverage: () => ours,
  useShareFamilyBibleBooks: () => share,
}));
vi.mock('../../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ isMobileSidebar: false, closeDrawer: vi.fn(), closeExpandedSidebar: vi.fn() }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

import PrototypeExpandedBibleMap from '../PrototypeExpandedBibleMap';
import { markPendingBibleMapBook, markPendingBibleMapSpace } from '../../../../lib/pending-bible-map-book';

const romans = { book: 'Romans', chapterCount: 16, levels: Array.from({ length: 16 }, (_, i) => (i === 7 ? 2 : 0)) as BibleCoverage['books'][number]['levels'] };

function renderMap() {
  return render(<PrototypeExpandedBibleMap exiting={false} origin={null} onClose={() => {}} />);
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  sessionStorage.clear();
  mine.data = { books: [romans] };
  ours.data = undefined;
  share.mutate.mockReset();
});
afterEach(() => sessionStorage.clear());

describe('PrototypeExpandedBibleMap', () => {
  it('is My Bible when nothing names a space', () => {
    renderMap();
    expect(screen.getByRole('heading', { name: 'My Bible' })).toBeTruthy();
    expect(screen.getByText("You've been in Romans.")).toBeTruthy();
  });

  it('is the room’s Our Bible when a space hub opened it', () => {
    markPendingBibleMapSpace('space_1');
    markPendingBibleMapBook('Romans');
    ours.data = { kind: 'space', coverage: { books: [romans] } };
    const { container } = renderMap();
    // A room's map keeps its chapters — the family test's "no strips" is a real difference.
    expect(container.querySelector('.proto-chapter-strip__cell')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Our Bible' })).toBeTruthy();
    expect(screen.getByText('This space has been in Romans.')).toBeTruthy();
    expect(screen.getByText('Written about or highlighted here')).toBeTruthy();
    expect(screen.queryByText('Read')).toBeNull();
  });

  it('shows a family books only — no chapter strips, no counts, no key', () => {
    markPendingBibleMapSpace('space_fam');
    markPendingBibleMapBook('Romans'); // opens the section so its rows render
    ours.data = { kind: 'family', coverage: coverageFromBooks(['Romans']), youShare: false };
    const { container } = renderMap();
    expect(screen.getByText('Your family has been in Romans.')).toBeTruthy();
    expect(container.querySelector('[data-book="Romans"]')).toBeTruthy();
    expect(container.querySelector('.proto-chapter-strip__cell')).toBeNull();
    expect(container.querySelector('.proto-bible-map__count')).toBeNull();
    expect(screen.queryByLabelText('Key')).toBeNull();
  });

  it('lets you add your books to the family’s, and take them back', () => {
    markPendingBibleMapSpace('space_fam');
    ours.data = { kind: 'family', coverage: coverageFromBooks([]), youShare: false };
    const { rerender } = renderMap();
    expect(screen.getByText('No one has added their books yet.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add my books' }));
    expect(share.mutate).toHaveBeenCalledWith(true);

    ours.data = { kind: 'family', coverage: coverageFromBooks(['Romans']), youShare: true };
    rerender(<PrototypeExpandedBibleMap exiting={false} origin={null} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take mine out' }));
    expect(share.mutate).toHaveBeenCalledWith(false);
  });
});
