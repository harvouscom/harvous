import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteSession } from '../useNoteSession';

const recordNoteVisitEvent = vi.fn();
vi.mock('../../pages/prototype/proto-note-visit-events', () => ({
  recordNoteVisitEvent: (...args: unknown[]) => recordNoteVisitEvent(...args),
}));

function Harness({
  noteId,
  enabled,
  // Stands in for the note object the call site also holds: a new identity every render,
  // exactly as `useNote` produces on a background refetch.
  note,
}: {
  noteId: string | undefined;
  enabled?: boolean;
  note?: object;
}) {
  void note;
  useNoteSession({ noteId, enabled });
  return null;
}

function renderSession(props: { noteId?: string; enabled?: boolean; note?: object }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness noteId={props.noteId ?? 'note_a'} enabled={props.enabled} note={props.note} />
    </QueryClientProvider>,
  );
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useNoteSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    recordNoteVisitEvent.mockClear();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('records nothing for a session under the floor', () => {
    const view = renderSession({});
    vi.advanceTimersByTime(1_500);
    view.unmount();
    expect(recordNoteVisitEvent).not.toHaveBeenCalled();
  });

  it('records a glance for a short open and a read for a real one', () => {
    const short = renderSession({});
    vi.advanceTimersByTime(5_000);
    short.unmount();
    expect(recordNoteVisitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'note_a', dwellBucket: 'glance' }),
    );

    recordNoteVisitEvent.mockClear();
    const real = renderSession({});
    vi.advanceTimersByTime(30_000);
    real.unmount();
    expect(recordNoteVisitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ dwellBucket: 'read' }),
    );
  });

  it('records nothing at all when disabled', () => {
    const view = renderSession({ enabled: false });
    vi.advanceTimersByTime(60_000);
    view.unmount();
    expect(recordNoteVisitEvent).not.toHaveBeenCalled();
  });

  /*
   * The reason this hook exists separately from the analytics effect beside it. That effect
   * has the note object in its deps and happily re-fires; if this one did, every long read
   * would restart at zero and be recorded as a glance.
   */
  it('does not restart the dwell clock when the note object identity changes', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <Harness noteId="note_a" note={{ v: 1 }} />
      </QueryClientProvider>,
    );

    vi.advanceTimersByTime(10_000);
    // A background refetch lands: same note, new object.
    view.rerender(
      <QueryClientProvider client={client}>
        <Harness noteId="note_a" note={{ v: 2 }} />
      </QueryClientProvider>,
    );
    vi.advanceTimersByTime(10_000);
    view.unmount();

    // 20s of continuous attention, so 'read'. A restarted clock would have seen 10s.
    expect(recordNoteVisitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ dwellBucket: 'read' }),
    );
  });

  it('stops accruing attention while the tab is hidden', () => {
    const view = renderSession({});
    vi.advanceTimersByTime(15_000);
    setVisibility('hidden');
    // Five minutes in the background must not turn a read into a study.
    vi.advanceTimersByTime(300_000);
    setVisibility('visible');
    view.unmount();

    const buckets = recordNoteVisitEvent.mock.calls.map((call) => call[0].dwellBucket);
    expect(buckets).toContain('read');
    expect(buckets).not.toContain('study');
  });

  it('reports again only once the session has grown into a fuller bucket', () => {
    const view = renderSession({});
    vi.advanceTimersByTime(15_000);
    setVisibility('hidden');
    expect(recordNoteVisitEvent.mock.calls.map((c) => c[0].dwellBucket)).toEqual(['read']);

    setVisibility('visible');
    vi.advanceTimersByTime(120_000);
    view.unmount();

    expect(recordNoteVisitEvent.mock.calls.map((c) => c[0].dwellBucket)).toEqual(['read', 'study']);
  });
});
