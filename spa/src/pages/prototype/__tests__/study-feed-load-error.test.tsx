/**
 * A feed that failed to load said "Your study will gather here" — the empty state, which
 * tells someone with a year of notes that they have done nothing. A failure has to say so,
 * and offer the way back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const feed = vi.hoisted(() => ({
  items: [] as unknown[],
  reviewAnswers: [] as unknown[],
  isPending: false,
  isError: true,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
  lockedBefore: null,
  refetch: vi.fn(),
}));

vi.mock('../../../hooks/queries/useStudyFeed', () => ({ useStudyFeed: () => feed }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../hooks/queries/useHistoryWindowStatus', () => ({
  useHistoryWindowStatus: () => ({ data: undefined }),
}));
vi.mock('../../../hooks/queries/useNavigation', () => ({ useNavigation: () => ({ data: undefined }) }));
vi.mock('../library-panel/use-library-panel-nav', () => ({ useLibraryPanelNav: () => ({}) }));
vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({
    openLibraryPanel: vi.fn(),
    setSidebarThreadProposal: vi.fn(),
    composeDockHostEl: null,
  }),
}));
vi.mock('../../../lib/prototype-organize-runner-store', () => ({ useOrganizeApi: () => ({}) }));
vi.mock('../useHomeNotes', () => ({
  useHomeNotes: () => ({ notes: [], ready: true, hasMoreNotes: false, noteTotal: 0 }),
}));
vi.mock('../../../hooks/usePrototypeHomeSpaceId', () => ({
  usePrototypeHomeSpaceId: () => ({ homeSpaceId: null }),
}));
vi.mock('../../../hooks/queries/usePrototypeSpaceScriptureIndex', () => ({
  usePrototypeSpaceScriptureIndex: () => ({ data: [], isPending: false }),
}));
vi.mock('../use-home-surface-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-home-surface-data')>()),
  useHomeSurfaceData: () => ({ contentReady: true, countForLogic: 0 }),
}));
/* Today's dock reads the whole home surface; past the error branch it is not what is tested. */
vi.mock('../PrototypeStudyFeedToday', () => ({ default: () => null }));
vi.mock('../use-todays-passage-focus', () => ({ useTodaysPassageFocus: () => {} }));
vi.mock('../../../hooks/queries/useChurchFeed', () => ({ useChurchFeed: () => ({ data: undefined }) }));
vi.mock('../../../hooks/queries/useChurchServiceChoice', () => ({
  useChurchServiceChoice: () => ({ data: undefined }),
}));

import PrototypeStudyFeedPage from '../PrototypeStudyFeedPage';

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PrototypeStudyFeedPage />
    </QueryClientProvider>,
  );
}

describe('Activity when the feed fails to load', () => {
  beforeEach(() => {
    feed.isError = true;
    feed.items = [];
    feed.refetch.mockClear();
  });

  it('says it failed instead of showing the empty state', () => {
    renderPage();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your study");
    expect(screen.queryByText(/Your study will gather here/)).toBeNull();
  });

  it('tries again from the button', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(feed.refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the day, not the error, when the load simply came back empty', () => {
    feed.isError = false;
    renderPage();
    expect(screen.queryByText("Couldn't load your study")).toBeNull();
  });
});
