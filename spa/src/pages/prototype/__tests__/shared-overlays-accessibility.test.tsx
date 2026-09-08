import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StudyThreadEntryDetail } from '../../../hooks/queries/useNote';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import SharedStudyHighlightOverlay, { sharedHighlightOverlayButtonLabel } from '../SharedStudyHighlightOverlay';

function studyThread(overrides: Partial<StudyThreadEntryDetail>): StudyThreadEntryDetail {
  return {
    id: 'entry-1',
    userId: 'user-1',
    parentNoteId: 'note-1',
    spaceId: 'space-1',
    entryKind: 'miniNote',
    highlightAccentRaw: 'warmAmber',
    sourceSnippet: 'Faith',
    focusTitle: null,
    notesBody: null,
    miniNoteBody: 'A response',
    linkedNoteId: null,
    linkedNoteTitle: null,
    anchorLocation: 1,
    anchorLength: 5,
    anchorTextSnapshot: 'Faith',
    scriptureReference: null,
    scripturePassageTranslation: null,
    scripturePassageExcerpt: null,
    isArchived: false,
    highlightListEditedAt: null,
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    authorDisplayName: 'Maya',
    ...overrides,
  };
}

describe('SharedStudyHighlightOverlay accessibility', () => {
  it('builds labels with annotation kind, actor, quote, and grouped response count', () => {
    expect(
      sharedHighlightOverlayButtonLabel({
        entryIds: ['one', 'two'],
        entryKind: 'miniNote',
        authorCount: 2,
        authorDisplayName: 'Maya',
        quote: '  Faith   works through love  ',
      }),
    ).toBe('Open note highlight by 2 people on “Faith works through love”. 2 responses share this passage');
  });

  it('keeps annotation buttons in the accessibility tree and preserves selection behavior', async () => {
    const onSelectEntry = vi.fn();
    const entries = [
      studyThread({ id: 'entry-1', userId: 'user-1', authorDisplayName: 'Maya' }),
      studyThread({ id: 'entry-2', userId: 'user-2', authorDisplayName: 'Jonah' }),
    ];
    const doc = {
      content: { size: 20 },
      textBetween: (from: number, to: number) => (from === 1 && to === 6 ? 'Faith' : ''),
      descendants: () => undefined,
    };
    const editor = {
      state: { doc },
      view: {
        coordsAtPos: (pos: number) => ({
          top: 20,
          bottom: 36,
          left: pos === 1 ? 10 : 50,
          right: pos === 1 ? 12 : 52,
        }),
      },
    };

    function Harness() {
      const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
      return (
        <div ref={setContainerEl}>
          <SharedStudyHighlightOverlay
            editor={editor}
            containerEl={containerEl}
            studyThreads={entries}
            onSelectEntry={onSelectEntry}
          />
        </div>
      );
    }

    render(<Harness />);
    const group = await screen.findByRole('group', { name: 'Shared note annotations' });
    expect(group).not.toHaveAttribute('aria-hidden');
    const annotation = screen.getByRole('button', {
      name: 'Open note highlight by 2 people on “Faith”. 2 responses share this passage',
    });
    expect(annotation.querySelector('.proto-shared-highlight-overlay__badge')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(annotation);
    expect(onSelectEntry).toHaveBeenCalledWith('entry-1', ['entry-1', 'entry-2']);
  });

  it('hands the dock a group in conversation order, oldest first', async () => {
    /*
      The incoming list is recency-ordered, which is right for "everything on
      this note" and wrong for a span several people are talking on: the dock
      carousel stepped backwards through the exchange, and the span was painted
      in the accent of the last reply rather than of the annotation that started
      it.

      Deliberately fed newest-first, which is the order the note payload
      actually arrives in.
    */
    const onSelectEntry = vi.fn();
    const entries = [
      studyThread({
        id: 'reply',
        userId: 'user-2',
        authorDisplayName: 'Jonah',
        highlightAccentRaw: 'coolSlate',
        createdAt: '2026-07-11T00:00:00.000Z',
      }),
      studyThread({
        id: 'opener',
        userId: 'user-1',
        authorDisplayName: 'Maya',
        highlightAccentRaw: 'warmAmber',
        createdAt: '2026-07-09T00:00:00.000Z',
      }),
    ];
    const doc = {
      content: { size: 20 },
      textBetween: (from: number, to: number) => (from === 1 && to === 6 ? 'Faith' : ''),
      descendants: () => undefined,
    };
    const editor = {
      state: { doc },
      view: {
        coordsAtPos: (pos: number) => ({
          top: 20,
          bottom: 36,
          left: pos === 1 ? 10 : 50,
          right: pos === 1 ? 12 : 52,
        }),
      },
    };

    function Harness() {
      const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
      return (
        <div ref={setContainerEl}>
          <SharedStudyHighlightOverlay
            editor={editor}
            containerEl={containerEl}
            studyThreads={entries}
            onSelectEntry={onSelectEntry}
          />
        </div>
      );
    }

    render(<Harness />);
    const annotation = await screen.findByRole('button', { name: /2 responses share this passage/ });
    fireEvent.click(annotation);
    /*
      Opener first — and the first id is also the group's representative, which
      is what the painted accent and the label are taken from. Fed newest-first
      above, so this fails if the sort is dropped.
    */
    expect(onSelectEntry).toHaveBeenCalledWith('opener', ['opener', 'reply']);
  });
});

describe('ProtoSpaceLoading accessibility', () => {
  it('announces its supplied loading label as a polite status', () => {
    render(<ProtoSpaceLoading label="Loading shared space" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading shared space');
    expect(status.querySelector('.load-more-indicator')).toHaveAttribute('aria-hidden', 'true');
  });
});
