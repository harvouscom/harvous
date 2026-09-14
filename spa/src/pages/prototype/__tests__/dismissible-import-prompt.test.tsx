import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import {
  PROTO_IMPORT_PROMPT_DISMISSED_KEY,
  useDismissibleImportPrompt,
} from '../use-dismissible-import-prompt';
import { emptyOnboardingState, type OnboardingState } from '@/utils/onboarding-state';

const dismissStep = vi.fn();
let harness: { state: OnboardingState; ready: boolean } = {
  state: emptyOnboardingState(),
  ready: true,
};

vi.mock('../useOnboardingState', () => ({
  useOnboardingState: () => ({ ...harness, dismissStep }),
}));

const withImport = (patch: { done?: boolean; dismissed?: boolean }): OnboardingState => {
  const state = emptyOnboardingState();
  state.steps.import = { done: false, dismissed: false, ...patch };
  return state;
};

beforeEach(() => {
  dismissStep.mockClear();
  harness = { state: emptyOnboardingState(), ready: true };
  window.localStorage.clear();
});

afterEach(() => window.localStorage.clear());

describe('the import row reads its dismissal from the account', () => {
  it('is not dismissed on a fresh account', () => {
    const { result } = renderHook(() => useDismissibleImportPrompt());
    expect(result.current.dismissed).toBe(false);
  });

  it('is dismissed once the account says so', () => {
    harness = { state: withImport({ dismissed: true }), ready: true };
    expect(renderHook(() => useDismissibleImportPrompt()).result.current.dismissed).toBe(true);
  });

  it('is also dismissed once the reader has actually imported', () => {
    // Nothing left to offer. `done` hides the row as surely as saying no to it does.
    harness = { state: withImport({ done: true }), ready: true };
    expect(renderHook(() => useDismissibleImportPrompt()).result.current.dismissed).toBe(true);
  });

  it('withholds `ready` until the account copy has arrived', () => {
    // The row is hidden while this is false, so it cannot appear and then vanish under the cursor.
    harness = { state: emptyOnboardingState(), ready: false };
    expect(renderHook(() => useDismissibleImportPrompt()).result.current.ready).toBe(false);
  });

  it('writes the dismissal to the account, not to this browser', () => {
    const { result } = renderHook(() => useDismissibleImportPrompt());
    result.current.dismiss();
    expect(dismissStep).toHaveBeenCalledWith('import');
    expect(window.localStorage.getItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY)).toBeNull();
  });
});

describe('the device-local flag it used to be', () => {
  it('carries a pre-existing dismissal up to the account, once', () => {
    /*
     * The failure this guards against is the loud one: without it, every reader who had already
     * put the row away would meet it again the day this shipped.
     */
    window.localStorage.setItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY, '1');
    const { rerender } = renderHook(() => useDismissibleImportPrompt());
    expect(dismissStep).toHaveBeenCalledWith('import');
    // Cleared, so a later render cannot re-push what the account already records.
    expect(window.localStorage.getItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY)).toBeNull();
    dismissStep.mockClear();
    rerender();
    expect(dismissStep).not.toHaveBeenCalled();
  });

  it('waits for the account copy before pushing anything', () => {
    // Pushing before hydration would be guessing at what the account already says.
    window.localStorage.setItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY, '1');
    harness = { state: emptyOnboardingState(), ready: false };
    renderHook(() => useDismissibleImportPrompt());
    expect(dismissStep).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY)).toBe('1');
  });

  it('does not push when the account already has the dismissal', () => {
    window.localStorage.setItem(PROTO_IMPORT_PROMPT_DISMISSED_KEY, '1');
    harness = { state: withImport({ dismissed: true }), ready: true };
    renderHook(() => useDismissibleImportPrompt());
    expect(dismissStep).not.toHaveBeenCalled();
  });

  it('leaves an un-dismissed device alone', () => {
    renderHook(() => useDismissibleImportPrompt());
    expect(dismissStep).not.toHaveBeenCalled();
  });
});
