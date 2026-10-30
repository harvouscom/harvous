/**
 * /churches/start — "Bring your church to Harvous", the door harvous.com's churches page links to.
 *
 * Deliberately thin. The request itself lives in Settings › My Church, under the church the
 * person picks from Here's My Church, because that is where the directory picker already lives
 * and a church request is about a church they have picked. This page only gets them there: signed
 * in, it goes straight on; signed out, it says what happens and sends them through sign-up, back
 * to the same place.
 */
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { PublicTopBar } from './public-shared';
import { markChurchBringRequested } from '../../lib/church-bring-flag';

const DESTINATION = '/prototype/settings/church';
export default function PublicStartChurchPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      markChurchBringRequested();
      void navigate({ to: DESTINATION as never, replace: true });
    }
  }, [isLoaded, isSignedIn, navigate]);

  const signUp = (toSignIn = false) => {
    // Back to this page, which forwards on: auth only returns to allowlisted public paths
    // (pending-auth-redirect.ts), and a settings URL is not one.
    const back = `${window.location.origin}/churches/start`;
    writePendingAuthRedirect(back);
    void navigate({ to: `/${toSignIn ? 'sign-in' : 'sign-up'}?redirect_url=${encodeURIComponent(back)}` as never });
  };

  return (
    <>
      <title>Bring your church to Harvous</title>
      <div className="public-page">
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />
        <div className="public-body">
          <div className="public-content">
            {!isLoaded || isSignedIn ? (
              <div className="page-loading" />
            ) : (
              <>
                <p className="public-creator">For pastors and church staff</p>
                <div className="public-card public-join-church">
                  <h1 className="public-card__title">Bring your church to Harvous</h1>
                  <p className="public-join-church__lede">
                    Create your account, find your church in the directory, and tell us who you are.
                    We set each church up personally and start you on a 30-day pilot. Then you invite
                    your team and share a link with your congregation.
                  </p>
                  <button type="button" className="public-cta-btn" onClick={() => signUp(false)}>
                    Get started
                  </button>
                  <button type="button" className="public-join-church__text-btn" onClick={() => signUp(true)}>
                    I already have an account
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
