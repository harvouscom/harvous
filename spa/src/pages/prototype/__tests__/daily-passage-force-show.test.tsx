/**
 * A reminder tap reveals today's passage, even when the flag arrives late.
 *
 * Rendered rather than source-read, because the defect is not in any value — it is in *when* the
 * row asks. A notification tap sets the force-show flag at the end of a promise chain: the
 * service worker parks the destination in Cache Storage, the client opens that cache, reads the
 * JSON, then routes. On a cold launch the row has mounted and returned null long before any of
 * that lands, and it holds its dismissal in `useState`, so a flag read once during render is a
 * question asked at exactly the wrong moment and never asked again.
 *
 * That is why this has been "fixed" twice and reported three times: every version of the flag
 * worked, and the row was not listening. The only assertion that can tell the difference is one
 * that hides the row first and sets the flag afterwards.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1', getToken: async () => 't' }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => () => {} }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => {} }),
}));
vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({
    isMobileSidebar: false,
    closeDrawer: () => {},
    beginPrototypeComposeSession: () => {},
  }),
}));

const {
  forceShowTodaysPassageToday,
  setVotdDismissedToday,
  TODAYS_PASSAGE_ANCHOR_ID,
} = await import('../../../lib/votd-today');
const PrototypeDailyPassagePill = (await import('../PrototypeDailyPassagePill')).default;

const votd = { reference: 'Romans 8:28', translation: 'NET' };

function renderRow() {
  return render(
    <PrototypeDailyPassagePill homeSpaceId="space_1" notes={[]} votd={votd} />,
  );
}

describe("today’s passage visibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T15:00:00-05:00'));
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the passage on an ordinary day', () => {
    renderRow();
    expect(screen.getByText('Romans 8:28')).toBeTruthy();
  });

  it('stays hidden once dismissed today', () => {
    setVotdDismissedToday('user_1');
    renderRow();
    expect(screen.queryByText('Romans 8:28')).toBeNull();
  });

  /* The whole point: hidden first, flag second. A render-time read cannot pass this. */
  it('comes back when a reminder asks for it after the row has already hidden', () => {
    setVotdDismissedToday('user_1');
    renderRow();
    expect(screen.queryByText('Romans 8:28')).toBeNull();

    act(() => {
      forceShowTodaysPassageToday();
    });

    expect(screen.getByText('Romans 8:28')).toBeTruthy();
  });

  it('carries the anchor the reminder scrolls to', () => {
    const { container } = renderRow();
    expect(container.querySelector(`#${TODAYS_PASSAGE_ANCHOR_ID}`)).toBeTruthy();
  });

  /* One browser, two accounts. The dismissal is the reader's, not the device's. */
  it('is not hidden by another account’s dismissal', () => {
    setVotdDismissedToday('user_someone_else');
    renderRow();
    expect(screen.getByText('Romans 8:28')).toBeTruthy();
  });
});
