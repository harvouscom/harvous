/**
 * Impressions travel together; everything else travels immediately.
 *
 * Home renders six suggestions and records one impression per card, which was six POSTs in a
 * single tick of an Activity load that already makes forty. They batch because nothing waits on
 * them — an impression is never read back for suppression and has no `onSynced` caller.
 *
 * The other actions must not join them, and that is the half worth guarding: an `open` is
 * followed straight away by navigation off this page, so a deferred flush is a lost event, and a
 * `snooze` or `dismissed` is what stops a card resurfacing on the reader's other devices.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/api', () => ({
  api: { post: vi.fn(() => Promise.resolve({ success: true })) },
}));

import { api } from '../../../lib/api';
import { recordRecallOpportunityEvent } from '../proto-recall-events';

const post = vi.mocked(api.post);

beforeEach(() => {
  vi.useFakeTimers();
  post.mockClear();
});

afterEach(() => {
  // Drain anything a test queued, so no batch leaks into the next one.
  vi.runAllTimers();
  vi.useRealTimers();
});

describe('recall impressions', () => {
  it('sends one request for the cards of one render', () => {
    const ids = ['hl:1', 'hl:2', 'hl:3', 'passage:John 3', 'arc:5', 'subject:mercy'];
    for (const id of ids) {
      recordRecallOpportunityEvent({ opportunityId: id, kind: 'highlight', action: 'impression' });
    }

    // Nothing has gone out yet: the flush is what collects them.
    expect(post).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0] as [string, { events: { opportunityId: string }[] }];
    expect(url).toBe('/api/recall/events');
    expect(body.events.map((e) => e.opportunityId)).toEqual(ids);
  });

  it('carries the note id when a card names one, and omits it when it does not', () => {
    recordRecallOpportunityEvent({
      opportunityId: 'hl:1',
      kind: 'highlight',
      action: 'impression',
      noteId: 'note_9',
    });
    recordRecallOpportunityEvent({ opportunityId: 'arc:2', kind: 'arc', action: 'impression' });
    vi.runAllTimers();

    const [, body] = post.mock.calls[0] as [string, { events: Record<string, unknown>[] }];
    expect(body.events[0]).toEqual({
      opportunityId: 'hl:1',
      kind: 'highlight',
      action: 'impression',
      noteId: 'note_9',
    });
    expect(body.events[1]).not.toHaveProperty('noteId');
  });

  it('starts a fresh batch after a flush rather than resending the last one', () => {
    recordRecallOpportunityEvent({ opportunityId: 'hl:1', kind: 'highlight', action: 'impression' });
    vi.runAllTimers();
    recordRecallOpportunityEvent({ opportunityId: 'hl:2', kind: 'highlight', action: 'impression' });
    vi.runAllTimers();

    expect(post).toHaveBeenCalledTimes(2);
    const second = post.mock.calls[1] as [string, { events: { opportunityId: string }[] }];
    expect(second[1].events.map((e) => e.opportunityId)).toEqual(['hl:2']);
  });

  it('empties the queue even when the request fails', async () => {
    post.mockRejectedValueOnce(new Error('offline'));
    recordRecallOpportunityEvent({ opportunityId: 'hl:1', kind: 'highlight', action: 'impression' });
    vi.runAllTimers();
    await Promise.resolve();

    recordRecallOpportunityEvent({ opportunityId: 'hl:2', kind: 'highlight', action: 'impression' });
    vi.runAllTimers();

    // The failed one is gone, not retried on the back of the next card seen.
    const second = post.mock.calls[1] as [string, { events: { opportunityId: string }[] }];
    expect(second[1].events.map((e) => e.opportunityId)).toEqual(['hl:2']);
  });
});

describe('every other action', () => {
  it('goes out on its own, and at once', async () => {
    const onSynced = vi.fn();
    recordRecallOpportunityEvent({
      opportunityId: 'hl:1',
      kind: 'highlight',
      action: 'open',
      noteId: 'note_9',
      onSynced,
    });

    // No timer to wait for: the reader is about to navigate away from this page.
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/recall/event', {
      opportunityId: 'hl:1',
      kind: 'highlight',
      action: 'open',
      noteId: 'note_9',
    });

    await vi.waitFor(() => expect(onSynced).toHaveBeenCalled());
  });

  it('does not batch a dismissal in behind an impression', () => {
    recordRecallOpportunityEvent({ opportunityId: 'hl:1', kind: 'highlight', action: 'impression' });
    recordRecallOpportunityEvent({ opportunityId: 'hl:2', kind: 'highlight', action: 'dismissed' });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('/api/recall/event');
  });

  it('records nothing at all for an incomplete payload', () => {
    recordRecallOpportunityEvent({ opportunityId: '', kind: 'highlight', action: 'impression' });
    vi.runAllTimers();
    expect(post).not.toHaveBeenCalled();
  });
});
