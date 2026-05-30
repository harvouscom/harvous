import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api, APIError } from '../../lib/api';
import { useAcceptInvitation } from '../../hooks/mutations/useAcceptInvitation';
import { navigationQueryKeyPrefix } from '../../hooks/queries/useNavigation';
import { idToUrl } from '@/utils/url-helpers';
import { prototypeHomePath, prototypeHomeRouteTo } from '@/lib/prototype-path';
import { PublicTopBar, CircleQuestionIcon } from './public-shared';

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
  space?: { id: string };
}

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PublicInvitationPage() {
  const { token } = useParams({ from: '/invitations/$token' });
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [data, setData] = useState<InvitationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const acceptInvitationMutation = useAcceptInvitation();
  const [error, setError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<InvitationResponse>(`/api/invitations/${token}`)
      .then(setData)
      .catch((err: APIError | Error) => {
        const msg = err.message || '';
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
      try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
      navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as any });
      return;
    }
    try {
      const result = await acceptInvitationMutation.mutateAsync(token);
      if (result.success) {
        try { sessionStorage.setItem('harvous_show_pwa_prompt_from_join', '1'); } catch (_) {}
        await queryClient.refetchQueries({ queryKey: navigationQueryKeyPrefix });
        navigate({ to: (result.redirectUrl || idToUrl(result.space.id)) as any });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to accept invitation. It may have already been used or expired.', 'error');
    }
  };

  const invitation = data?.invitation;
  const spaceColor = invitation?.spaceColor || 'paper';
  const colorVar = `var(--color-${spaceColor})`;
  const inviterName = invitation?.invitedBy?.displayName || 'A Harvous User';

  const isAlreadyUsed = invitation && invitation.status !== 'pending' && !invitation.isExpired;
  const isExpiredError = error === 'expired' || invitation?.isExpired;

  return (
    <>
      {invitation && <title>{`${invitation.spaceTitle || 'Space Invitation'} | Harvous`}</title>}
      <div className="public-page">
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className="public-content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error === 'not_found' || (!data && !error)) ? (
              <div className="public-error">
                <div className="public-error__icon"><CircleQuestionIcon /></div>
                <h1 className="public-error__title">This invitation isn't available</h1>
                <p className="public-error__message">
                  Hmm, we can't find this invitation. The link might be invalid or the invitation may have been cancelled.
                </p>
                <a href="https://harvous.com" className="public-error__link">Learn more about Harvous</a>
              </div>
            ) : isExpiredError ? (
              <div className="public-error">
                <div className="public-error__icon" style={{ fontSize: '2.5rem' }}>⏰</div>
                <h1 className="public-error__title">This invitation has expired</h1>
                <p className="public-error__message">
                  This invitation link is no longer valid. Please request a new invitation from the space owner.
                </p>
                <a href={prototypeHomePath()} className="public-error__link">Go to app</a>
              </div>
            ) : (error === 'already_used' || isAlreadyUsed) ? (
              <div className="public-error">
                <div className="public-error__icon" style={{ fontSize: '2.5rem' }}>✓</div>
                <h1 className="public-error__title">
                  {errorMessage || `This invitation has been ${invitation?.status || 'used'}`}
                </h1>
                <p className="public-error__message">
                  This invitation link has already been used and is no longer active.
                </p>
                <a href={prototypeHomePath()} className="public-error__link">Go to app</a>
              </div>
            ) : invitation ? (
              <SubtleContentMount>
                <>
                  <p className="public-creator">
                    {inviterName} invited you to join this space on Harvous
                  </p>

                  <div className="public-card">
                    <div className="public-card__color-stripe" style={{ background: colorVar }} />
                    <div className="public-card__header">
                      <h1 className="public-card__title">{invitation.spaceTitle}</h1>
                    </div>

                    <div className="public-card__scroll">
                      {invitation.message ? (
                        <p className="public-invite-message">"{invitation.message}"</p>
                      ) : (
                        <div className="public-card__empty">
                          You've been invited to join this collaborative Bible study space.
                        </div>
                      )}
                      {invitation.expiresAt && (
                        <p className="public-expiry">
                          Expires {(() => { const d = new Date(invitation.expiresAt!); return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })()}
                        </p>
                      )}
                      {data?.alreadyMember && (
                        <p className="public-already-member">✓ You're already in this space</p>
                      )}
                    </div>

                    <div className="public-card__cta">
                      <div className={`public-toast public-toast--${toastType}${toastVisible ? ' public-toast--visible' : ''}`}>
                        {toastMessage}
                      </div>
                      {data?.requiresAuth || !isSignedIn ? (
                        <a
                          href={`/sign-in?redirect_url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                          className="public-cta-btn"
                          onClick={() => {
                            try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
                          }}
                        >
                          Sign in to accept
                        </a>
                      ) : data?.alreadyMember ? (
                        <button className="public-cta-btn" onClick={() => navigate({ to: prototypeHomeRouteTo() as any })}>
                          Go to app
                        </button>
                      ) : (
                        <button
                          className="public-cta-btn"
                          onClick={handleAccept}
                          disabled={acceptInvitationMutation.isPending}
                        >
                          {acceptInvitationMutation.isPending ? 'Accepting…' : 'Accept Invitation'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="public-footer">
                    Harvous is a notes app for Bible study.{' '}
                    <a href="https://harvous.com" target="_blank" rel="noopener noreferrer">harvous.com</a>
                  </p>
                </>
              </SubtleContentMount>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
