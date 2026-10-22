import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrototypeSidebarSearchResultItem from '../../PrototypeSidebarSearchResultItem';
import { makeLibrarySearchRowBody } from '../LibrarySearchRowBody';
import type { SidebarSearchResult } from '../../sidebar-search-types';

describe('search row presenter with and without the Library row body', () => {
  const result: SidebarSearchResult = { id: 'folder:Sermons', kind: 'folder', title: 'Sermons', subtitle: '12 notes' };

  it('draws the sidebar’s own row without one', () => {
    const { container } = render(
      <ul>
        <PrototypeSidebarSearchResultItem
          result={result}
          onActivate={() => {}}
          notesById={new Map()}
          highlightsById={new Map()}
          leadIcon="folder"
        />
      </ul>,
    );
    expect(container.querySelector('li')!.hasAttribute('data-kind')).toBe(false);
    expect(container.querySelector('.proto-search-row__meta')).toBeNull();
    expect(screen.getByText('12 notes').className).toContain('proto-note-row__preview');
  });

  it('keeps the row a button and moves the count to the meta slot with one', () => {
    const { container } = render(
      <ul>
        <PrototypeSidebarSearchResultItem
          result={result}
          onActivate={() => {}}
          notesById={new Map()}
          highlightsById={new Map()}
          leadIcon="folder"
          renderBody={makeLibrarySearchRowBody({ query: 'serm', notesById: new Map(), highlightsById: new Map() })}
        />
      </ul>,
    );
    expect(container.querySelector('li')!.getAttribute('data-kind')).toBe('folder');
    expect(screen.getByRole('button')).toBeTruthy();
    expect(screen.getByText('12 notes').className).toContain('proto-search-row__meta');
    expect(container.querySelector('mark.proto-verse-hit__match')!.textContent).toBe('Serm');
  });
});
