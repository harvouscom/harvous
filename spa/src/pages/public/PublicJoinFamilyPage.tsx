/**
 * `/family/join/:token` — a family invite, sent by a parent from Settings › Family.
 *
 * The page's real job is consent. It says which role the invite is for and exactly what
 * that role shares, and the redeem sends the role back (`acknowledgedRole`) so the server
 * can refuse a join that didn't see it. See docs/future/FAMILY_ACCOUNTS.md.
 *
 * Signed out, it goes to sign-up the way the church join page does, and parks the token for
 * the return trip. Unlike that page it does **not** replay the join on return: someone just
 * back from sign-up should still press the button that names the role.
 */
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useState } from 'react';
import Icon from '@/components/react/Icon';
import { enterSpaceUrl } from '@/utils/enter-space-link';
import { FAMILY_ROLE_LABEL } from '@/lib/family-roles';
import { APIError } from '../../lib/api';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { hasGuestSession } from '../../lib/guest-session';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import { useFamilyInvitePreview, useRedeemFamilyInvite } from '../../hooks/queries/useFamily';
import { PublicErrorState, PublicTopBar } from './public-shared';

/** App.tsx's PendingDiscoverToastBridge — generic in everything but its name. */
const PENDING_TOAST_KEY = 'pendingDiscoverToast';

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? 'an' : 'a';
}

export default function PublicJoinFamilyPage() {
  const { token } = useParams({ from: '/family/join/$token' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const preview = useFamilyInvitePreview(token);
  const redeem = useRedeemFamilyInvite(token);
  const [message, setMessage] = useState<string | null>(null);

  const data = preview.data;
  const roleLabel = data ? FAMILY_ROLE_LABEL[data.role] : '';

  function goToSignUp(toSignIn = false) {
    writePendingAuthRedirect(window.location.href);
    const back = encodeURIComponent(window.location.href);
    if (toSignIn) {
      void navigate({ to: `/sign-in?redirect_url=${back}` as never });
      return;
    }
    if (hasGuestSession()) {
      leaveForSignUp();
      void navigate({ to: guestSignUpHref() as never });
      return;
    }
    void navigate({ to: `/sign-up?redirect_url=${back}` as never });
  }

  async function join() {
    if (!data) return;
    setMessage(null);
    try {
      const result = await redeem.mutateAsync(data.role);
      clearPendingAuthRedirect();
      try {
        sessionStorage.setItem(
          PENDING_TOAST_KEY,
          JSON.stringify({
            message: result.alreadyMember ? `You’re already in ${data.familyName}` : `You joined ${data.familyName}`,
          }),
        );
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        void navigate({ to: enterSpaceUrl(result.spaceId) as never });
      }, 250);
    } catch (error) {
      if (error instanceof APIError && error.code === 'ALREADY_IN_FAMILY') {
        setMessage('You’re already in another family. Leave it in Settings › Family first, then open this link again.');
        return;
      }
      setMessage(error instanceof Error ? error.message : 'Could not join. Try again in a moment.');
    }
  }

  const busy = redeem.isPending;
  const failed = preview.isError;

  return (
    <>
      {data ? <title>{`${data.familyName} | Harvous`}</title> : null}
      <div className="public-page">
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />
        <div className="public-body">
          <div className="public-content">
            {preview.isLoading || (!data && !failed) ? (
              <div className="page-loading" />
            ) : !data ? (
              <PublicErrorState title="This invite isn’t working" message="Ask whoever sent it for a new one." />
            ) : !data.valid ? (
              <PublicErrorState title={data.reason ?? 'This invite is no longer active'} message="Ask whoever sent it for a new one." />
            ) : (
              <>
                <p className="public-creator">
                  {data.inviterFirstName ? `${data.inviterFirstName} invited you` : 'You’re invited'}
                </p>
                <div className="public-card public-join-church">
                  <div className="public-join-church__head">
                    <span className="public-join-church__glyph" aria-hidden>
                      <Icon name="user-group" size={20} />
                    </span>
                    <div className="public-join-church__head-text">
                      <h1 className="public-card__title">{data.familyName}</h1>
                      <p className="public-card__meta">{`Joining as ${article(roleLabel)} ${roleLabel.toLowerCase()}`}</p>
                    </div>
                  </div>

                  <p className="public-join-church__lede">{data.disclosure.summary}</p>

                  {data.role === 'child' ? (
                    <div className="public-join-church__group">
                      <div className="public-join-church__group-head">
                        <span className="public-join-church__group-name">What your parents can see</span>
                      </div>
                      <ul className="public-join-church__channels">
                        {data.disclosure.shares.map((line) => (
                          <li key={line}>
                            <div className="public-join-church__channel public-join-church__channel--static">
                              <span className="public-join-church__channel-text">
                                <span className="public-join-church__channel-title">{line}</span>
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <p className="public-join-church__lede">{data.disclosure.never}</p>

                  <div className="public-join-church__foot">
                    {message ? (
                      <p className="public-join-church__notice public-join-church__notice--error" role="alert">
                        {message}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="public-cta-btn"
                      disabled={busy}
                      onClick={() => (isSignedIn ? void join() : goToSignUp())}
                    >
                      {!isSignedIn ? 'Create your free account' : busy ? 'Joining…' : `Join as ${article(roleLabel)} ${roleLabel.toLowerCase()}`}
                    </button>
                    {!isSignedIn ? (
                      <button type="button" className="public-join-church__text-btn" onClick={() => goToSignUp(true)}>
                        I already have an account
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="public-footer public-footer--rich">
                  <span className="public-footer__tag">
                    Families share a space on Harvous. Notes you write on your own stay yours.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
