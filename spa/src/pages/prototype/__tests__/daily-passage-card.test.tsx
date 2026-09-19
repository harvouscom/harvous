/**
 * Today's passage as a card at the top of Activity, until it is acted on.
 *
 * Rendered, with the real VOTD cache update, because the behaviour worth pinning is what
 * each action does to *where the passage is*: acting on it folds the card (in this cache, and
 * via the server on every other device); dismissing hides it; neither happens by accident.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const navigate = vi.fn();
const setQueryData = vi.fn();
const beginPrototypeComposeSession = vi.fn();
const fetchSpy = vi.fn(async () => new Response('{}'));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user_1', getToken: async () => 't' }),
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: () => {}, setQueryData }),
}));
vi.mock('../../../layouts/proto-shell-context', () => ({
  useProtoShell: () => ({ isMobileSidebar: false, closeDrawer: () => {}, beginPrototypeComposeSession }),
}));

const { default: PrototypeDailyPassageCard, dailyPassageShowsCard } = await import(
  '../PrototypeDailyPassageCard'
);

const votd = {
  reference: 'Psalm 18:1-2',
  translation: 'NET',
  textHtml: '<sup class="verse-num">1</sup>I love you, LORD, my strength.',
  actedToday: false,
};

const todaysNote = {
  id: 'note_1',
  title: 'Psalm 18:1-2',
  content: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as never;

const lastEngagement = () => {
  const call = fetchSpy.mock.calls.at(-1) as unknown as [string, RequestInit] | undefined;
  return call ? (JSON.parse(String(call[1].body)) as { action: string }).action : null;
};

/* The fold, read back through the updater the card handed to the VOTD cache. */
const actedAfterUpdate = () => {
  const updater = setQueryData.mock.calls.at(-1)?.[1] as ((v: typeof votd) => typeof votd) | undefined;
  return updater ? updater(votd).actedToday : undefined;
};

describe('where the passage sits', () => {
  it('takes the card while there are words and it has not been acted on', () => {
    expect(dailyPassageShowsCard(votd)).toBe(true);
  });

  it('folds to the row once acted on, here or on another device', () => {
    expect(dailyPassageShowsCard({ ...votd, actedToday: true })).toBe(false);
  });

  it('is the row when there are no words to show', () => {
    // A failed text lookup costs the words, not the passage.
    expect(dailyPassageShowsCard({ reference: 'Psalm 18:1-2', translation: 'NET' })).toBe(false);
  });
});

describe('the card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('fetch', fetchSpy);
  });

  it('shows the words, the reference and the translation', () => {
    render(<PrototypeDailyPassageCard homeSpaceId="space_1" notes={[]} votd={votd} />);
    expect(screen.getByText('Psalm 18:1-2 · NET')).toBeTruthy();
    expect(screen.getByText(/I love you, LORD, my strength\./)).toBeTruthy();
    expect(document.getElementById('todays-passage')).toBeTruthy();
  });

  it('opening it in the reader folds it and tells the server', () => {
    render(<PrototypeDailyPassageCard homeSpaceId="space_1" notes={[]} votd={votd} />);
    fireEvent.click(screen.getByText('Open in Bible'));
    expect(actedAfterUpdate()).toBe(true);
    expect(lastEngagement()).toBe('open_reader');
    expect(navigate).toHaveBeenCalled();
  });

  it('taking a note composes on the passage, folds it, and records the note', () => {
    render(<PrototypeDailyPassageCard homeSpaceId="space_1" notes={[]} votd={votd} />);
    fireEvent.click(screen.getByText('Create note'));
    expect(beginPrototypeComposeSession).toHaveBeenCalled();
    expect(actedAfterUpdate()).toBe(true);
    expect(lastEngagement()).toBe('add_note');
  });

  it('offers the note already started today instead of a second one', () => {
    render(<PrototypeDailyPassageCard homeSpaceId="space_1" notes={[todaysNote]} votd={votd} />);
    fireEvent.click(screen.getByText('Open your note'));
    expect(beginPrototypeComposeSession).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ params: { noteId: expect.any(String) } }));
  });

  it('"Not today" hides it without counting as acting on it', () => {
    render(<PrototypeDailyPassageCard homeSpaceId="space_1" notes={[]} votd={votd} />);
    fireEvent.click(screen.getByLabelText("Dismiss today's passage"));
    expect(screen.queryByText('Open in Bible')).toBeNull();
    expect(setQueryData).not.toHaveBeenCalled();
    expect(lastEngagement()).toBe('dismiss');
  });
});
