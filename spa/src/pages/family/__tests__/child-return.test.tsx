import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signOut: vi.fn(), navigate: vi.fn(), cancelQueries: vi.fn(), clear: vi.fn(), clearStorage: vi.fn(), clearPersisted: vi.fn()
}));
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true }), useClerk: () => auth }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => auth.navigate }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => auth }));
vi.mock('@/utils/clear-user-client-caches', () => ({ clearUserClientStorageCaches: auth.clearStorage }));
vi.mock('@/utils/query-cache-persistence', () => ({ deletePersistedQueryCache: auth.clearPersisted }));
vi.mock('../../../hooks/useAuthHeroImage', () => ({ useAuthHeroImage: () => ({ isReady: true }) }));
vi.mock('../../../hooks/useClerkSignInSubtitlePatch', () => ({ useClerkSignInSubtitlePatch: () => {} }));
vi.mock('../../../components/auth/ClerkPrebuiltAuth', () => ({ default: () => null }));
vi.mock('../../../components/auth/HarvousAuthForm', () => ({ default: () => null }));
import SignInPage from '../../SignInPage';

afterEach(() => { cleanup(); vi.resetAllMocks(); window.history.replaceState(null, '', '/'); });

it('does not resume an existing adult session when returning from child mode', async () => {
  window.history.replaceState(null, '', '/sign-in?redirect_url=%2Fsettings%2Fchild-accounts&child_return=1');
  auth.signOut.mockRejectedValueOnce(new Error('Simulated sign-out failure'));
  auth.signOut.mockImplementationOnce(() => new Promise(() => {}));
  render(<SignInPage />);
  await screen.findByRole('alert');
  expect(auth.clearPersisted).toHaveBeenCalledBefore(auth.signOut);
  expect(auth.navigate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(2));
  expect(auth.navigate).not.toHaveBeenCalled();
});
