import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StudyDockEntry, StudyDockStack } from '@/utils/study-dock-stack';
import StudyDockCarouselWeb from '../StudyDockCarouselWeb';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function scriptureEntry(id: string, reference: string): StudyDockEntry {
  return {
    id,
    kind: 'scripture',
    stableKey: `scripture:${reference}`,
    openedAt: 1,
    expanded: false,
    session: {
      boundaries: null,
      reference,
      translation: 'NET',
      noteId: 'note-1',
      pillAccent: null,
    },
  };
}

const stack: StudyDockStack = {
  entries: [
    scriptureEntry('dock-a', 'John 3:16'),
    scriptureEntry('dock-b', 'Romans 8:1'),
    scriptureEntry('dock-c', 'Psalm 23:1'),
  ],
  activeId: 'dock-a',
};

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('StudyDockCarouselWeb keyboard accessibility', () => {
  function renderCarousel({ realisticControls = false } = {}) {
    const onSelectEntry = vi.fn();
    const onMoveEntry = vi.fn();
    render(
      <StudyDockCarouselWeb
        stack={stack}
        onSelectEntry={onSelectEntry}
        onMoveEntry={onMoveEntry}
        renderEntry={(entry) =>
          realisticControls ? (
            <div className="study-dock-card__outer">
              <div className="study-dock-card__card">
                <div className="study-dock-card__header-actions">
                  <button type="button" aria-label={`Close ${entry.id}`}>
                    Close
                  </button>
                  <button type="button" aria-label={`Menu ${entry.id}`}>
                    Menu
                  </button>
                </div>
                <div className="study-dock-card__body-wrap">
                  <label htmlFor={`title-${entry.id}`}>Title {entry.id}</label>
                  <input id={`title-${entry.id}`} defaultValue={entry.id} />
                  <textarea aria-label={`Notes ${entry.id}`} defaultValue="Notes" />
                </div>
              </div>
            </div>
          ) : (
            <div className="study-dock-card__outer">
              <div className="study-dock-card__card">{entry.id}</div>
            </div>
          )
        }
      />,
    );
    return { onSelectEntry, onMoveEntry };
  }

  it('exposes interactive cards as list items without hiding nested controls behind tab semantics', () => {
    const { onMoveEntry } = renderCarousel({ realisticControls: true });
    expect(screen.getByRole('list', { name: 'Open study docks' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);
    expect(items[0]).toHaveAttribute('aria-current', 'true');
    expect(items[0]).not.toHaveAttribute('aria-selected');
    expect(items[0]).toHaveAccessibleName('Scripture John 3:16');

    const titleInput = screen.getByRole('textbox', { name: 'Title dock-a' });
    const notesInput = screen.getByRole('textbox', { name: 'Notes dock-a' });
    const closeButton = screen.getByRole('button', { name: 'Close dock-a' });
    const menuButton = screen.getByRole('button', { name: 'Menu dock-a' });
    const reorderControl = screen.getByRole('button', {
      name: /Reorder Scripture John 3:16, position 1 of 3/,
    });
    for (const control of [titleInput, notesInput, closeButton, menuButton, reorderControl]) {
      expect(control.closest('[role="tab"]')).toBeNull();
    }

    titleInput.focus();
    fireEvent.keyDown(titleInput, { key: 'ArrowRight' });
    expect(titleInput).toHaveFocus();

    items[0].focus();
    fireEvent.keyDown(items[0], { key: 'ArrowRight' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: 'ArrowLeft', altKey: true });
    expect(onMoveEntry).toHaveBeenCalledWith('dock-b', 0);
  });

  it('moves roving focus with arrows and Home/End, then activates with Enter or Space', () => {
    const { onSelectEntry } = renderCarousel();
    const items = screen.getAllByRole('listitem');
    items[0].focus();

    fireEvent.keyDown(items[0], { key: 'ArrowRight' });
    expect(items[1]).toHaveFocus();
    expect(items[1]).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(items[1], { key: 'Enter' });
    expect(onSelectEntry).toHaveBeenLastCalledWith('dock-b');

    fireEvent.keyDown(items[1], { key: 'End' });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(items[2], { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: ' ' });
    expect(onSelectEntry).toHaveBeenLastCalledWith('dock-a');
  });

  it('supports announced modifier-arrow reorder and a tabbable active drag handle', () => {
    const { onMoveEntry } = renderCarousel();
    const items = screen.getAllByRole('listitem');
    items[1].focus();
    fireEvent.keyDown(items[1], { key: 'ArrowLeft', altKey: true });
    expect(onMoveEntry).toHaveBeenCalledWith('dock-b', 0);
    expect(screen.getByRole('status')).toHaveTextContent('Moved Scripture Romans 8:1 to position 1 of 3.');

    const activeHandle = screen.getByRole('button', {
      name: /Reorder Scripture John 3:16, position 1 of 3/,
    });
    expect(activeHandle).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(activeHandle, { key: 'ArrowRight' });
    expect(onMoveEntry).toHaveBeenCalledWith('dock-a', 1);
  });
});
