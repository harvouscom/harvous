import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrototypeSidebarSearchResultItem from '../PrototypeSidebarSearchResultItem';
import { buildScriptureReferenceResult } from '../sidebar-universal-search';

/**
 * The row presenter switches on kind and returns null in its default branch, so a kind
 * that reaches it unhandled renders nothing at all — no error, no row, just a passage
 * result that silently never appears. Building the result is therefore not enough to
 * know the feature works; this asserts it actually reaches the screen.
 */
describe('scripture reference search row', () => {
  function renderRow(query: string) {
    const result = buildScriptureReferenceResult(query);
    if (!result) throw new Error(`expected a result for ${query}`);
    const onActivate = vi.fn();
    render(
      <ul>
        <PrototypeSidebarSearchResultItem
          result={result}
          active={false}
          onActivate={onActivate}
          notesById={new Map()}
          highlightsById={new Map()}
        />
      </ul>,
    );
    return onActivate;
  }

  it('renders a row for a passage the query names', () => {
    renderRow('John 15');

    expect(screen.getByText('John 15')).toBeTruthy();
    expect(screen.getByText('Read passage')).toBeTruthy();
  });

  it('activates when clicked, so the passage can open', () => {
    const onActivate = renderRow('Jn 3:16');

    screen.getByRole('button').click();

    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
