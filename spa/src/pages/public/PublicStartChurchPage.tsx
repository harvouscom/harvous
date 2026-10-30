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
import Icon from '@/components/react/Icon';
import { markChurchBringRequested } from '../../lib/church-bring-flag';

const DESTINATION = '/prototype/settings/church';

/** What happens, in the order it happens — the paragraph this replaced said all three at once. */
const STEPS = [
  { title: 'Create your account', meta: 'Free, and yours whether or not your church joins' },
  { title: 'Find your church and tell us your role', meta: 'From the Here’s My Church directory' },
  { title: 'We set it up with you', meta: 'Your team, channels and service times, on a 30-day pilot' },
] as const;
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
                <div className="public-card public-join-church public-start-church">
                  {/* The same head the join page wears, so the two church doors look like one place. */}
                  <div className="public-join-church__head">
                    <span className="public-join-church__glyph" aria-hidden>
                      <Icon name="church" size={20} />
                    </span>
                    <div className="public-join-church__head-text">
                      <h1 className="public-card__title">Bring your church to Harvous</h1>
                      <p className="public-card__meta">Set up with you · 30-day pilot</p>
                    </div>
                  </div>

                  <p className="public-join-church__lede">
                    Plan what each ministry teaches, publish it to the people who attend, and let
                    them study it in their own notes.
                  </p>

                  <ol className="public-start-church__steps">
                    {STEPS.map((step, index) => (
                      <li key={step.title} className="public-start-church__step">
                        <span className="public-start-church__num" aria-hidden>
                          {index + 1}
                        </span>
                        <span className="public-start-church__step-text">
                          <span className="public-start-church__step-title">{step.title}</span>
                          <span className="public-start-church__step-meta">{step.meta}</span>
                        </span>
                      </li>
                    ))}
                  </ol>

                  <div className="public-join-church__foot">
                    <button type="button" className="public-cta-btn" onClick={() => signUp(false)}>
                      Get started
                    </button>
                    <button type="button" className="public-join-church__text-btn" onClick={() => signUp(true)}>
                      I already have an account
                    </button>
                  </div>
                </div>

                <p className="public-start-church__aside">
                  Questions first?{' '}
                  <a href="https://harvous.com/for/churches/#interest">Tell us about your church</a>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
