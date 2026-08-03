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

  async function dispatchedFeedback(show: () => void) {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    show();
    return dispatchSpy.mock.calls.find(
      ([event]) => event instanceof CustomEvent && event.type === PROTO_FEEDBACK_TOAST_EVENT,
    )?.[0] as
      | CustomEvent<{
          message: string;
          variant?: string;
          persistent?: boolean;
          action?: { label: string };
        }>
      | undefined;
  }

  it('dispatches an ephemeral error toast with no action by default', async () => {
    // Errors used to be duration: Infinity with a Support button every time, so a
    // transient blip demanded the same attention as a genuinely stuck state. The design
    // system reserves toasts for ephemeral feedback; persistence is now opt-in.
    const { toast } = await import('../toast');
    const event = await dispatchedFeedback(() => toast.error('Could not update space'));

    expect(event?.detail.message).toBe('Could not update space');
    expect(event?.detail.variant).toBe('error');
    expect(event?.detail.persistent).toBe(false);
    expect(event?.detail.action).toBeUndefined();
  });

  it('offers support only when the caller asks for a persistent toast', async () => {
    const { toast } = await import('../toast');
    const event = await dispatchedFeedback(() =>
      toast.error('Could not update space', { persistent: true }),
    );

    expect(event?.detail.persistent).toBe(true);
    // "Get support" matches the design-system gallery baseline (ds-12-toasts);
    // production had drifted to "Support".
    expect(event?.detail.action).toEqual({ label: 'Get support' });
  });
});
