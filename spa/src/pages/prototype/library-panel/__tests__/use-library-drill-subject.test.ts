/**
 * The back row names the Thread you drilled into.
 *
 * It read "Thread" over "Thread": a Thread drill carries only an id, and nothing looked the name
 * up. These pin where the name comes from for each kind of Thread, and the one way it could name
 * the wrong one.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const studyThread = vi.fn();
const groupThreads = vi.fn();

vi.mock('../../../../hooks/queries/usePrototypeStudyThread', () => ({
  usePrototypeStudyThread: (...args: unknown[]) => studyThread(...args),
}));
vi.mock('../../../../hooks/queries/useSpaceGroupThreads', () => ({
  useSpaceGroupThreads: (...args: unknown[]) => groupThreads(...args),
}));

const { useLibraryDrillSubject, resolveThreadDrillSubject } = await import(
  '../use-library-drill-subject'
);

beforeEach(() => {
  studyThread.mockReset().mockReturnValue({ data: undefined, isPlaceholderData: false });
  groupThreads.mockReset().mockReturnValue({ data: undefined });
});

function subjectFor(threadId: string, spaceId = 'space_home') {
  return renderHook(() =>
    useLibraryDrillSubject({ tab: 'threads', drill: { kind: 'thread', threadId } }, spaceId),
  ).result.current;
}

describe('a personal Thread', () => {
  it('goes by its title, read from the same query the Thread view makes', () => {
    studyThread.mockReturnValue({
      data: { threadTitle: 'Salvation', suggestedTitle: 'Grace' },
      isPlaceholderData: false,
    });
    expect(subjectFor('abc123')).toBe('Salvation');
    // Same arguments as `PrototypeLibraryThreadView`, so the two share one cache entry.
    expect(studyThread).toHaveBeenCalledWith('abc123', 'space_home');
  });

  it('falls back to the suggested name when it has no title of its own', () => {
    studyThread.mockReturnValue({
      data: { threadTitle: '  ', suggestedTitle: 'Grace' },
      isPlaceholderData: false,
    });
    expect(subjectFor('abc123')).toBe('Grace');
  });

  it('says nothing while still showing the previous Thread’s data', () => {
    // The study-thread query keeps the last Thread as a placeholder while the next loads.
    // Its name over the new Thread's notes would be wrong, so the header waits.
    studyThread.mockReturnValue({
      data: { threadTitle: 'The previous one', suggestedTitle: null },
      isPlaceholderData: true,
    });
    expect(subjectFor('abc123')).toBeNull();
  });
});

describe('a shared Thread', () => {
  it('goes by its record’s title from the space’s thread list', () => {
    groupThreads.mockReturnValue({
      data: [
        { id: 'thread_other', title: 'Not this one' },
        { id: 'thread_1', title: 'Romans together' },
      ],
    });
    expect(subjectFor('thread_1', 'space_room')).toBe('Romans together');
    expect(groupThreads).toHaveBeenCalledWith('space_room');
    // The personal graph query is not asked about a `thread_` record.
    expect(studyThread).toHaveBeenCalledWith(undefined, 'space_room');
  });
});

describe('outside a Thread drill', () => {
  it('has no subject, and asks neither query for anything', () => {
    const { result } = renderHook(() =>
      useLibraryDrillSubject(
        { tab: 'folders', drill: { kind: 'folder', folderKey: 'Sermons' } },
        'space_home',
      ),
    );
    expect(result.current).toBeNull();
    expect(studyThread).toHaveBeenCalledWith(undefined, 'space_home');
    expect(groupThreads).toHaveBeenCalledWith(undefined);
  });
});

describe('resolveThreadDrillSubject', () => {
  it('is null when there is no name worth saying, so the header falls back to "Thread"', () => {
    expect(resolveThreadDrillSubject({ personal: { threadTitle: null, suggestedTitle: '' } })).toBeNull();
    expect(resolveThreadDrillSubject({})).toBeNull();
  });
});
