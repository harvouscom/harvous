/**
 * /churches/start — "Bring your church to Harvous", the door harvous.com's churches page links to.
 *
 * Deliberately thin. The request itself lives in Settings › My Church, under the church the
 * person picks from Here's My Church, because that is where the directory picker already lives
 * and a church request is about a church they have picked. This page only gets them there: signed
 * in, it goes straight on; signed out, it says what happens and sends them through sign-up, back
 * to the same place.
 *
 * The look is the sign-in page's: a sky over cream paper, and the request as a short letter on a
 * fanned stack, the headline marked like "your" is there. Chosen by Derek (Oct 30 2026) over a
 * split "show what they see" layout and a dark glass one.
 */
import { useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { markChurchBringRequested } from '../../lib/church-bring-flag';
import { useAuthHeroImage } from '../../hooks/useAuthHeroImage';
import '../../styles/church-start.css';

const DESTINATION = '/prototype/settings/church';
const SITE_FORM = 'https://harvous.com/for/churches/#interest';

/** What happens, in the order it happens. */
const STEPS = [
  { title: 'Create your account', meta: 'Free, and yours whether or not your church joins' },
  { title: 'Find your church', meta: 'Pick it from the directory and tell us your role' },
  { title: 'We set it up with you', meta: 'Team, channels and service times, on a 30-day pilot' },
] as const;

export default function PublicStartChurchPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const { heroImage, isReady } = useAuthHeroImage();

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

  if (!isLoaded || isSignedIn) {
    return <div className="cs-loading page-loading" />;
  }

  return (
    <>
      <title>Bring your church to Harvous</title>
      <div className="cs-a">
        <div
          className={`cs-a__sky${isReady ? ' cs-a__sky--ready' : ''}`}
          style={isReady ? { backgroundImage: `url(${heroImage})` } : undefined}
          aria-hidden
        />
        <a href="https://harvous.com" className="cs-a__logo" aria-label="Harvous">
          <img src="/images/icons/icon-192.png" alt="" width={44} height={44} />
        </a>
        <div className="cs-a__stack">
          <div className="cs-a__leaf cs-a__leaf--back" aria-hidden />
          <div className="cs-a__leaf cs-a__leaf--mid" aria-hidden />
          <div className="cs-a__letter">
            <p className="cs-eyebrow">For pastors and church staff</p>
            <h1 className="cs-headline">
              Bring <span className="cs-mark">your church</span> to Harvous.
            </h1>
            <p className="cs-pitch">
              Plan what each ministry teaches. Publish it to the people who attend. They study it in
              their own notes, and keep them.
            </p>
            <ol className="cs-a__steps">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="cs-a__num">{i + 1}</span>
                  <span>
                    <span className="cs-step-title">{step.title}</span>
                    <span className="cs-step-meta">{step.meta}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="cs-actions">
              <button type="button" className="cs-primary proto-ink-on-accent" onClick={() => signUp(false)}>
                Get started
              </button>
              <button type="button" className="cs-quiet" onClick={() => signUp(true)}>
                I already have an account
              </button>
            </div>
          </div>
        </div>
        <p className="cs-a__foot">
          Questions first? <a href={SITE_FORM}>Tell us about your church →</a>
        </p>
      </div>
    </>
  );
}
