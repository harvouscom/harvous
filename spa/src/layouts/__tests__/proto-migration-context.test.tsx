import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockToastError = vi.fn();
const mockFetchStatus = vi.fn();
const mockMutateAsync = vi.fn();

vi.mock('@/utils/toast', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }));
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }) }));
vi.mock('../../hooks/usePrototypeHomeSpaceId', () => ({
  usePrototypeHomeSpaceId: () => ({ homeSpaceId: 'space_home', authReady: true }),
}));
vi.mock('../../lib/refresh-client-data', () => ({ refreshPrototypeLists: vi.fn() }));
vi.mock('../../hooks/mutations/usePrototypeMigration', () => ({
  fetchPrototypeMigrationStatus: () => mockFetchStatus(),
  usePrototypeMigration: () => ({ mutateAsync: () => mockMutateAsync() }),
}));

const { ProtoMigrationProvider } = await import('../proto-migration-context');

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProtoMigrationProvider>
        <div>child</div>
      </ProtoMigrationProvider>
    </QueryClientProvider>
  );
}

describe('ProtoMigrationProvider', () => {
  beforeEach(() => {
    mockToastError.mockReset();
    mockFetchStatus.mockReset();
    mockMutateAsync.mockReset();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('stays silent when the read-only status probe fails', async () => {
    // A transient GET failure on boot means nothing was attempted — telling the user
    // a folder update failed is both alarming and untrue.
    mockFetchStatus.mockRejectedValue(new Error('network error'));

    renderProvider();

    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalled());
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('does not mark migration done when the probe fails, so a later boot retries', async () => {
    mockFetchStatus.mockRejectedValue(new Error('network error'));

    renderProvider();

    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalled());
    expect(localStorage.getItem('harvous-prototype-migration-v1-done')).toBeNull();
  });

  it('still reports a genuine migration failure', async () => {
    mockFetchStatus.mockResolvedValue({ success: true, needsCollectionBackfill: true });
    mockMutateAsync.mockRejectedValue(new Error('write blew up'));

    renderProvider();

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastError).toHaveBeenCalledWith(
      'Could not finish the folder update — your notes are safe'
    );
  });

  it('skips the migration entirely when no backfill is needed', async () => {
    mockFetchStatus.mockResolvedValue({ success: true, needsCollectionBackfill: false });

    renderProvider();

    await waitFor(() => expect(mockFetchStatus).toHaveBeenCalled());
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
