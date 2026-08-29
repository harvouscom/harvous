/**
 * The highlight switch, and the one thing about it that is arithmetic rather than markup.
 *
 * `.proto-seg-track` sizes its thumb `track / count` and slides it by whole thumb-widths, so
 * the index it is given has to be the position of the selected option in the *same* list the
 * buttons are rendered from. Reading the two from one table is what guarantees that; these
 * assert it stays true, including for a value the table does not contain, where a `-1` from
 * `findIndex` would park the thumb one step off the left end.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HIGHLIGHT_KIND_OPTIONS } from '../../sidebar-search-types';
import PrototypeLibraryHighlightKinds from '../PrototypeLibraryHighlightKinds';

function renderSwitch(value: string) {
  const onChange = vi.fn();
  const { container } = render(
    <PrototypeLibraryHighlightKinds value={value as never} onChange={onChange} />,
  );
  const track = container.querySelector('.proto-library-kinds') as HTMLElement;
  return { track, onChange, container };
}

describe('the track', () => {
  it('rides the shared thumb, and says how many segments it has', () => {
    const { track } = renderSwitch('all');
    expect(track.classList.contains('proto-seg-track')).toBe(true);
    expect(track.style.getPropertyValue('--proto-seg-count')).toBe(
      String(HIGHLIGHT_KIND_OPTIONS.length),
    );
  });

  it('points the thumb at the selected option position', () => {
    for (const [i, option] of HIGHLIGHT_KIND_OPTIONS.entries()) {
      const { track } = renderSwitch(option.id);
      expect(track.style.getPropertyValue('--proto-seg-index')).toBe(String(i));
    }
  });

  it('parks at the first segment rather than off the end for a value it does not know', () => {
    // `findIndex` returns -1, which would translate the thumb one full step to the left.
    const { track } = renderSwitch('nonsense');
    expect(track.style.getPropertyValue('--proto-seg-index')).toBe('0');
  });
});

describe('the segments', () => {
  it('renders one tab per kind, from the shared table', () => {
    const { container } = renderSwitch('all');
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(HIGHLIGHT_KIND_OPTIONS.map((o) => o.label));
  });

  it('marks exactly one selected', () => {
    const { container } = renderSwitch('scripture');
    const selected = [...container.querySelectorAll('[aria-selected="true"]')];
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe('Scripture');
  });

  it('reports the kind that was pressed', () => {
    const { onChange } = renderSwitch('all');
    screen.getByText('References').click();
    expect(onChange).toHaveBeenCalledWith('references');
  });
});
