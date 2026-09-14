/**
 * What a crash looks like when the bundle, not the code, is the problem.
 *
 * "Try again" re-renders the same stale component and fails identically; the honest offer is a
 * reload. The report still goes out either way — tagged, so the admin list can tell the two
 * apart instead of showing both as one mystery.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const isStaleBuild = vi.fn();
const reportRouteBoundaryError = vi.fn();
const reloadPrototypeAfterUpdate = vi.fn();

vi.mock('@/utils/build-freshness', () => ({ isStaleBuild }));
vi.mock('@/utils/diagnostics-client', () => ({ reportRouteBoundaryError }));
vi.mock('@/utils/prototype-app-update-notice', () => ({ reloadPrototypeAfterUpdate }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

const PrototypeRouteErrorState = (await import('../PrototypeRouteErrorState')).default;

beforeEach(() => {
  isStaleBuild.mockReset();
  reportRouteBoundaryError.mockReset();
  reloadPrototypeAfterUpdate.mockReset();
});

describe('a route crash', () => {
  const error = new Error("Cannot read properties of undefined (reading 'blankLengths')");

  it('offers a reload, not a retry, when this bundle is behind the deploy', async () => {
    isStaleBuild.mockResolvedValue(true);
    render(<PrototypeRouteErrorState error={error} reset={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Harvous was updated/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    // The crash is still ours to know about, and is marked as the skew it is.
    expect(reportRouteBoundaryError).toHaveBeenCalledWith(error, { staleBuild: true });
  });

  it('shows the ordinary error state when the bundle is current', async () => {
    isStaleBuild.mockResolvedValue(false);
    render(<PrototypeRouteErrorState error={error} reset={vi.fn()} />);

    await waitFor(() => expect(reportRouteBoundaryError).toHaveBeenCalledWith(error, null));
    expect(screen.getByText(/Whoops/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.queryByText(/Harvous was updated/)).toBeNull();
  });
});
