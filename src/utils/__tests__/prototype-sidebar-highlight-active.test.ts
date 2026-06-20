import { describe, it, expect } from 'vitest';
import {
  isSidebarHighlightRowActive,
  parsePrototypeNoteHighlightSearch,
  resolveSidebarFocusedHighlightThreadId,
} from '@/utils/prototype-sidebar-highlight-active';

describe('parsePrototypeNoteHighlightSearch', () => {
  it('reads highlight and studyThread from object search', () => {
    expect(
      parsePrototypeNoteHighlightSearch({ highlight: 'thread_a', studyThread: 'thread_b' }),
    ).toEqual({
      highlightSearchId: 'thread_a',
      studyThreadSearchId: 'thread_b',
    });
  });

  it('reads dockReq from object search', () => {
    expect(
      parsePrototypeNoteHighlightSearch({
        highlight: 'thread_a',
        dockReq: '1710000000000',
      }),
    ).toEqual({
      highlightSearchId: 'thread_a',
      dockReq: '1710000000000',
    });
  });

  it('reads from query string search', () => {
    expect(parsePrototypeNoteHighlightSearch('?highlight=hl_1&studyThread=st_2&dockReq=123')).toEqual({
      highlightSearchId: 'hl_1',
      studyThreadSearchId: 'st_2',
      dockReq: '123',
    });
  });
});

describe('resolveSidebarFocusedHighlightThreadId', () => {
  it('prefers highlight search param over studyThread', () => {
    expect(
      resolveSidebarFocusedHighlightThreadId({
        highlightSearchId: 'hl_1',
        studyThreadSearchId: 'st_2',
      }),
    ).toBe('hl_1');
  });

  it('falls back to studyThread then standalone focus', () => {
    expect(resolveSidebarFocusedHighlightThreadId({ studyThreadSearchId: 'st_2' })).toBe('st_2');
    expect(
      resolveSidebarFocusedHighlightThreadId({
        standaloneFocusedHighlightThreadId: 'passage_1',
      }),
    ).toBe('passage_1');
  });

  it('returns null when nothing is focused', () => {
    expect(resolveSidebarFocusedHighlightThreadId({})).toBeNull();
  });
});

describe('isSidebarHighlightRowActive', () => {
  it('is false when viewing a note without a highlight deep link', () => {
    expect(
      isSidebarHighlightRowActive(
        { id: 'thread_1' },
        { highlightSearchId: undefined, studyThreadSearchId: undefined },
      ),
    ).toBe(false);
  });

  it('is true only for the explicitly focused thread', () => {
    const ctx = { highlightSearchId: 'thread_2' };
    expect(isSidebarHighlightRowActive({ id: 'thread_1' }, ctx)).toBe(false);
    expect(isSidebarHighlightRowActive({ id: 'thread_2' }, ctx)).toBe(true);
  });

  it('does not activate all highlights from the open parent note', () => {
    expect(
      isSidebarHighlightRowActive(
        { id: 'thread_1' },
        {
          highlightSearchId: undefined,
          studyThreadSearchId: undefined,
          standaloneFocusedHighlightThreadId: undefined,
        },
      ),
    ).toBe(false);
  });
});
