import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createKeyedDebouncer,
  invalidationDebounceKey,
  invalidationDebounceMs,
  REALTIME_INVALIDATION_DEBOUNCE_MS,
  REALTIME_LIVE_BODY_DEBOUNCE_MS,
} from '../realtime-invalidation-debounce';

describe('invalidationDebounceKey', () => {
  it('keys by type and id', () => {
    expect(invalidationDebounceKey({ type: 'note:updated', id: 'note_1' })).toBe(
      'note:updated:note_1',
    );
  });

  it('tolerates a missing id', () => {
    expect(invalidationDebounceKey({ type: 'sync:batch' })).toBe('sync:batch:');
  });
});

describe('invalidationDebounceMs', () => {
  it('uses the fast lane for live-body note patches', () => {
    expect(
      invalidationDebounceMs({
        type: 'note:updated',
        id: 'note_1',
        note: { title: 'Hi', content: '<p>x</p>', spaceId: null },
      }),
    ).toBe(REALTIME_LIVE_BODY_DEBOUNCE_MS);
  });

  it('uses the default window without a note patch', () => {
    expect(invalidationDebounceMs({ type: 'note:updated', id: 'note_1' })).toBe(
      REALTIME_INVALIDATION_DEBOUNCE_MS,
    );
  });
});

describe('createKeyedDebouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not drop a note:created that arrives during a pending note:updated', () => {
    vi.useFakeTimers();
    const debouncer = createKeyedDebouncer();
    const fired: string[] = [];

    debouncer.schedule('note:updated:note_1', 600, () => fired.push('updated'));
    vi.advanceTimersByTime(100);
    debouncer.schedule('note:created:note_2', 600, () => fired.push('created'));

    expect(debouncer.pendingKeys().sort()).toEqual([
      'note:created:note_2',
      'note:updated:note_1',
    ]);

    vi.advanceTimersByTime(600);
    expect(fired).toEqual(['updated', 'created']);
  });

  it('replaces only the same key', () => {
    vi.useFakeTimers();
    const debouncer = createKeyedDebouncer();
    const fired: string[] = [];

    debouncer.schedule('note:updated:note_1', 600, () => fired.push('first'));
    vi.advanceTimersByTime(100);
    debouncer.schedule('note:updated:note_1', 600, () => fired.push('second'));
    vi.advanceTimersByTime(600);

    expect(fired).toEqual(['second']);
  });
});
