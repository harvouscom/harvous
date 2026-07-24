import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTO_FEEDBACK_TOAST_EVENT } from '../prototype-feedback-toast';

describe('toast prototype feedback fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches prototype feedback event on prototype shell when Sonner is suppressed', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { toast } = await import('../toast');

    toast.success('Copied to Team space');

    const feedbackEvent = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === PROTO_FEEDBACK_TOAST_EVENT,
    )?.[0] as CustomEvent<{ message: string; variant?: string }> | undefined;

    expect(feedbackEvent?.detail.message).toBe('Copied to Team space');
    expect(feedbackEvent?.detail.variant).toBe('success');
  });

  it('dispatches persistent error toast with Support action on prototype shell', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const { toast } = await import('../toast');

    toast.error('Could not update space');

    const feedbackEvent = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === PROTO_FEEDBACK_TOAST_EVENT,
    )?.[0] as CustomEvent<{
      message: string;
      variant?: string;
      persistent?: boolean;
      action?: { label: string };
    }> | undefined;

    expect(feedbackEvent?.detail.message).toBe('Could not update space');
    expect(feedbackEvent?.detail.variant).toBe('error');
    expect(feedbackEvent?.detail.persistent).toBe(true);
    expect(feedbackEvent?.detail.action).toEqual({ label: 'Support' });
  });
});
