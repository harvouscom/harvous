import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ProtoRetryAction from '../ProtoRetryAction';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import PrototypeListEmptyState from '../PrototypeListEmptyState';

/**
 * A failed load must never look like "nothing here": error states carry a Try again that
 * asks again, and dots that can't finish because the device is offline say so.
 */
afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('failed-load states', () => {
  it('an error empty state offers Try again, which retries', () => {
    const onRetry = vi.fn();
    render(
      <PrototypeListEmptyState
        iconName="circle-exclamation"
        title="Couldn’t load notes"
        action={<ProtoRetryAction onRetry={onRetry} />}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('loading dots say when the device is offline, and stop saying it once back', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<ProtoSpaceLoading />);
    expect(screen.getByText(/you’re offline/i)).toBeTruthy();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/you’re offline/i)).toBeNull();
  });

  it('no offline line while online', () => {
    render(<ProtoSpaceLoading />);
    expect(screen.queryByText(/you’re offline/i)).toBeNull();
  });
});
