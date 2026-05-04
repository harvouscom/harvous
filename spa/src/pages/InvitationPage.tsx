import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import CardStack from '../components/CardStack';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api, APIError } from '../lib/api';
import { useAcceptInvitation } from '../hooks/mutations/useAcceptInvitation';
import { navigationQueryKeyPrefix } from '../hooks/queries/useNavigation';
import { idToUrl } from '../../../src/utils/url-helpers';

interface InvitationResponse {
  invitation: {
    spaceTitle: string;
    spaceColor?: string;
    invitedBy: { displayName: string };
    message?: string;
    expiresAt?: string;
    isExpired: boolean;
    status: string;
  };
  canAccept: boolean;
  alreadyMember: boolean;
  requiresAuth: boolean;
  space?: {
    id: string;
  };
}

export default function InvitationPage() {
  const { token } = useParams({ from: '/invitations/$token' });
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [data, setData] = useState<InvitationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const acceptInvitationMutation = useAcceptInvitation();
  const [error, setError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<InvitationResponse>(`/api/invitations/${token}`)
      .then(setData)
      .catch((err: APIError | Error) => {
        const msg = err.message || '';
        // API returns HTTP errors for expired/used invitations
        if (msg.toLowerCase().includes('expired')) {
          setError('expired');
        } else if (msg.toLowerCase().includes('accepted') || msg.toLowerCase().includes('declined') || msg.toLowerCase().includes('already been')) {
          setError('already_used');
          setErrorMessage(msg);
        } else {
          setError('not_found');
        }
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  function showToast(message: string, type: 'success' | 'error', duration = 5000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
    }
  }

  const handleAccept = async () => {
    if (!isSignedIn) {
      try {
        sessionStorage.setItem('harvous_pending_redirect', window.location.href);
      } catch { /* ignore */ }
      navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as any });
      return;
    }
    try {
      const result = await acceptInvitationMutation.mutateAsync(token);
      if (result.success) {
        try {
          sessionStorage.setItem('harvous_show_pwa_prompt_from_join', '1');
        } catch (_) {}
        await queryClient.refetchQueries({ queryKey: navigationQueryKeyPrefix });
        const path = result.redirectUrl || idToUrl(result.space.id);
        navigate({ to: path as any });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept invitation. It may have already been used or expired.', 'error');
    }
  };

  const HarvousLogo = () => (
    <svg width="28" height="40" viewBox="0 0 45 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Harvous">
      <path d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z" fill="#fff"/>
    </svg>
  );

  const CircleQuestionIcon = () => (
    <svg width="48" height="48" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
    </svg>
  );

  const invitation = data?.invitation;
  const spaceColor = invitation?.spaceColor || 'paper';
  const inviterDisplayName = invitation?.invitedBy?.displayName || 'A Harvous User';

  // Determine if already used from API response
  const isAlreadyUsed = invitation && invitation.status !== 'pending' && !invitation.isExpired;
  const isExpiredError = error === 'expired' || invitation?.isExpired;

  return (
    <>
      {data?.invitation && (
        <title>{`${data.invitation.spaceTitle || 'Space Invitation'} | Space Invitation`}</title>
      )}
    <div id="invitation-content" className="auth-page" style={{ padding: '12px', minHeight: '100vh' }}>
      <div className="auth-page__container">
        {/* Left Column: Animated Mesh Gradient Background */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://app.harvous.com" className="auth-page__logo-container">
              <HarvousLogo />
            </a>
          </div>
        </div>

        {/* Right Column: Invitation Content */}
        <div className="auth-page__form-section shared-page__content-section">
          <div className="shared-page__content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error === 'not_found' || (!data && !error)) ? (
              <div className="shared-page__error">
                <div className="shared-page__error-icon">
                  <CircleQuestionIcon />
                </div>
                <h1 className="shared-page__error-title">This invitation isn't available</h1>
                <p className="shared-page__error-message">
                  Hmm, we can't find this invitation. The link might be invalid or the invitation may have been cancelled.
                </p>
                <a href="https://app.harvous.com" className="shared-page__error-link">
                  Learn more about Harvous
                </a>
              </div>
            ) : isExpiredError ? (
              <div className="shared-page__error">
                <div className="shared-page__error-icon">⏰</div>
                <h1 className="shared-page__error-title">This invitation has expired</h1>
                <p className="shared-page__error-message">
                  This invitation link is no longer valid. Please request a new invitation from the space owner.
                </p>
                <a href="/dashboard" className="shared-page__error-link">
                  Go to Dashboard
                </a>
              </div>
            ) : (error === 'already_used' || isAlreadyUsed) ? (
              <div className="shared-page__error">
                <div className="shared-page__error-icon">✓</div>
                <h1 className="shared-page__error-title">
                  {errorMessage || `This invitation has been ${invitation?.status || 'used'}`}
                </h1>
                <p className="shared-page__error-message">
                  This invitation link has already been used and is no longer active.
                </p>
                <a href="/dashboard" className="shared-page__error-link">
                  Go to Dashboard
                </a>
              </div>
            ) : invitation ? (
              <SubtleContentMount>
                <>
                {/* Inviter info (above CardStack) */}
                <div className="shared-page__creator">
                  <p>{inviterDisplayName} invited you to join this space on Harvous</p>
                </div>

                {/* CardStack with invitation */}
                <div className="shared-page__card-container">
                  <CardStack
                    title={invitation.spaceTitle}
                    headerBgColor={`var(--color-${spaceColor})`}
                    centerTitle={true}
                  >
                    {/* Invitation content */}
                    <div className="shared-page__notes-scroll">
                      {invitation.message ? (
                        <div className="shared-page__notes-empty">
                          <p>"{invitation.message}"</p>
                        </div>
                      ) : (
                        <div className="shared-page__notes-empty">
                          <p>You've been invited to join this collaborative Bible study space.</p>
                        </div>
                      )}

                      {invitation.expiresAt && (
                        <div className="shared-page__expiry-notice">
                          Expires {(() => { const d = new Date(invitation.expiresAt!); const M = ['January','February','March','April','May','June','July','August','September','October','November','December']; return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })()}
                        </div>
                      )}

                      {data?.alreadyMember && (
                        <div className="shared-page__member-status">✓ You're already in this space</div>
                      )}
                    </div>

                    {/* CTA Button wrapper with toast */}
                    <div className="shared-page__cta-wrapper">
                      <div className={`shared-page__toast shared-page__toast--${toastType}${toastVisible ? ' shared-page__toast--visible' : ''}`}>
                        <span>{toastMessage}</span>
                      </div>

                      {data?.requiresAuth || !isSignedIn ? (
                        <a
                          href={`/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`}
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={() => {
                            try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
                          }}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">Sign in to accept</span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </a>
                      ) : data?.alreadyMember ? (
                        <button
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={() => navigate({ to: '/dashboard' as any })}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">Go to Dashboard</span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </button>
                      ) : (
                        <button
                          className="btn btn--lg btn--primary shared-page__cta-button"
                          onClick={handleAccept}
                          disabled={acceptInvitationMutation.isPending}
                        >
                          <div className="btn__content">
                            <span className="shared-page__cta-text">
                              {acceptInvitationMutation.isPending ? 'Accepting…' : 'Accept Invitation'}
                            </span>
                          </div>
                          <div className="btn__shadow-overlay" />
                        </button>
                      )}
                    </div>
                  </CardStack>
                </div>

                {/* Footer text (below CardStack) */}
                <div className="shared-page__footer">
                  <p>Harvous is a notes app designed for Bible study.</p>
                  <a href="https://app.harvous.com" target="_blank" rel="noopener noreferrer">Learn more at app.harvous.com</a>
                </div>
              </>
              </SubtleContentMount>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
