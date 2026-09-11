/**
 * `/discover/:slug` in the app — the install action, and nothing else.
 *
 * Division of labour with harvous.com: **the marketing site owns the indexed
 * page**, and this owns only what happens when someone presses the button. That
 * is why this page is thin, is in no sitemap, and needs no OG work — a crawler
 * or an unfurler meets harvous.com's page, never this one, so
 * `netlify/edge-functions/shared-og.ts` and `server/routes/og.ts` stay untouched.
 *
 * What it does own is the one thing a static page cannot: carrying the intent
 * across sign-up. Arriving signed out, it parks the slug and sends the visitor
 * to **sign-up** rather than sign-in — they came from marketing, so an account
 * is the likely thing they need — then replays on return. Same shape and the
 * same 600s expiry as PublicSharedNotePage.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { clearPendingAuthRedirect, writePendingAuthRedirect } from '../../lib/pending-auth-redirect';
import { useInstallDiscoverListing } from '../../hooks/mutations/useDiscoverMutations';
import type { DiscoverListing } from '../../hooks/queries/useDiscoverListings';
import { PublicTopBar, PublicErrorState } from './public-shared';
import { noteUrlForCurrentSurface } from '@/utils/url-helpers';

const PENDING_KEY = 'pendingDiscoverInstall';
const PENDING_TTL_MS = 600_000;

type Status = 'loading' | 'ready' | 'installing' | 'done' | 'already' | 'error';

export default function PublicDiscoverListingPage() {
  const { slug } = useParams({ from: '/discover/$slug' });
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();
  const install = useInstallDiscoverListing();
  const [listing, setListing] = useState<DiscoverListing | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<string | null>(null);
  /* An install is not idempotent from the user's point of view — it toasts and
     navigates — so the replay must fire once even if the effect re-runs. */
  const startedRef = useRef(false);

  useEffect(() => {
    api
      .get<{ listing: DiscoverListing }>(`/api/discover/listings/${slug}`)
      .then((data) => {
        setListing(data.listing);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [slug]);

  async function doInstall() {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus('installing');
    try {
      const result = await install.mutateAsync(slug);
      setStatus(result.alreadyInstalled ? 'already' : 'done');
      clearPendingAuthRedirect();
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ignore */
      }
      /* Land on the thing they just took when there is one to open. A template
         or a link has no page of its own — it is now in their picker or their
         library — so the confirmation above is the whole answer and this page
         stays put rather than dumping them somewhere unrelated. */
      const noteId = result.createdIds?.noteId;
      if (noteId) {
        const destination = noteUrlForCurrentSurface(noteId);
        window.setTimeout(() => {
          void navigate({ to: destination as never });
        }, 900);
      }
    } catch (error) {
      startedRef.current = false;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not save that.');
    }
  }

  /*
   * Who to credit, and whether there is anything to take.
   *
   * `preview.official` means Harvous published this itself. It changes the kicker
   * and the footer — the account that ran the seed is not the author, and a
   * built-in has no `NoteTemplates` row to name one from — and it changes the
   * action, because an official template ships in `getBuiltInTemplates()` and is
   * already in every account under the browse sheet's "Included" tab. Wording is
   * harvous.com's, verbatim, so the two products describe a listing the same way.
   */
  const isOfficial = Boolean(listing?.preview?.official);

  /* Replay after Clerk returns. Also covers ?install=1 arriving already signed
     in, which is the common case for someone who is logged in on this device. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !listing || startedRef.current) return;
    /* Nothing to replay for an official listing — signing up *is* what hands it
       over, and the server refuses the install as `ALREADY_INCLUDED`. Without
       this, a visitor who pressed "Get Harvous free" would come back from sign-up
       to an error on the template they had just been given. */
    if (isOfficial) return;
    const params = new URLSearchParams(window.location.search);
    let pending = params.get('install') === '1';
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { slug?: string; timestamp?: number };
        if (parsed.slug === slug && Date.now() - (parsed.timestamp ?? 0) < PENDING_TTL_MS) {
          pending = true;
        }
        sessionStorage.removeItem(PENDING_KEY);
      }
    } catch {
      /* ignore */
    }
    if (pending) void doInstall();
  }, [isLoaded, isSignedIn, listing, slug]);

  function handlePress() {
    if (isSignedIn && !isOfficial) {
      void doInstall();
      return;
    }
    /* An official listing parks nothing: there is no install waiting on the other
       side of sign-up, only the account that already includes it. */
    if (!isOfficial) {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ slug, timestamp: Date.now() }));
      } catch {
        /* ignore */
      }
    }
    writePendingAuthRedirect(window.location.href);
    // Sign-up, not sign-in: this visitor came from marketing.
    void navigate({
      to: `/sign-up?redirect_url=${encodeURIComponent(window.location.href)}` as never,
    });
  }

  const kindNoun =
    listing?.kind === 'pack'
      ? 'Thread'
      : listing?.kind === 'note'
        ? 'note'
        : listing?.kind === 'resource'
          ? 'link'
          : 'template';
  /* The structure is the honest preview of a starter and the note titles are the
     honest preview of a series. Neither is the body — taking a copy is what hands
     that over. */
  const outline: string[] = listing?.preview?.headings ?? listing?.preview?.titles ?? [];

  /*
   * A template and a note are a sheet somebody wrote on, so they get the
   * paper stack `PublicSharedNotePage` uses — the same object, drawn the same way,
   * rather than a rounded product card that says "listing" on a page whose whole
   * job is to show the thing itself.
   *
   * A pack and a resource keep the plain card, which is the division harvous.com
   * already draws: a Thread is a collection and a resource is a pointer somewhere
   * else. Paper would claim authorship for neither.
   */
  const onPaper = listing?.kind === 'template' || listing?.kind === 'note';

  return (
    <>
      {listing ? <title>{`${listing.title} | Harvous`}</title> : null}
      <div className="public-page">
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />

        <div className="public-body">
          <div className="public-content">
            {status === 'loading' ? (
              <div className="page-loading" />
            ) : !listing ? (
              <PublicErrorState
                title="This isn't available"
                message="We can't find this one. It may have been taken back by whoever shared it."
              />
            ) : (
              <>
                <p className="public-creator">
                  {isOfficial
                    ? `A ${kindNoun} included with Harvous`
                    : listing.authorDisplayName
                      ? `A ${kindNoun} shared by ${listing.authorDisplayName}`
                      : `A ${kindNoun} shared on Harvous`}
                </p>

                <div className={onPaper ? 'public-paper-stack' : undefined}>
                  {onPaper ? (
                    <>
                      <div
                        className="public-paper-stack__leaf public-paper-stack__leaf--back"
                        aria-hidden
                      />
                      <div
                        className="public-paper-stack__leaf public-paper-stack__leaf--mid"
                        aria-hidden
                      />
                    </>
                  ) : null}
                  <div className={`public-card${onPaper ? ' public-card--paper' : ''}`}>
                    <div className="public-card__header">
                      <h1 className="public-card__title">{listing.title}</h1>
                      {listing.description ? (
                        <p className="public-card__meta">{listing.description}</p>
                      ) : null}
                    </div>

                    <div className="public-card__scroll">
                      {outline.length === 0 ? (
                        <div className="public-card__empty">
                          Take a copy to see what's inside.
                        </div>
                      ) : (
                        <ul className="public-card__list">
                          {outline.map((line, index) => (
                            <li
                              key={`${line}-${index}`}
                              className="public-card__list-item card-enter"
                              style={{ animationDelay: `${100 + index * 40}ms` }}
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* `public-card__cta` is the pinned footer, not the button —
                        it sets `pointer-events: none` and the button inside takes
                        them back. `public-cta-btn` is the button. */}
                    <div className="public-card__cta">
                      {message ? (
                        <div className="public-invite-message" role="alert">
                          {message}
                        </div>
                      ) : null}
                      {/*
                        An official listing is not something you take — it ships with
                        the app, under the browse sheet's "Included" tab, from
                        `getBuiltInTemplates()`. So a member already has it, and there
                        is nothing to press; for a visitor the honest action is not
                        "save this" but "get Harvous", because an account is the whole
                        thing that hands it over. Offering "Save this to my Harvous"
                        for both was the button promising a copy nobody needs — and
                        the server would have minted a duplicate to keep the promise.
                      */}
                      {isOfficial ? (
                        isSignedIn ? (
                          <div className="public-already-member" role="status">
                            This one is already in your templates.
                          </div>
                        ) : (
                          <button type="button" className="public-cta-btn" onClick={handlePress}>
                            Get Harvous free
                          </button>
                        )
                      ) : status === 'done' || status === 'already' ? (
                        <div className="public-already-member" role="status">
                          {status === 'done'
                            ? 'Saved to your Harvous.'
                            : 'This is already in your Harvous.'}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="public-cta-btn"
                          disabled={status === 'installing'}
                          onClick={handlePress}
                        >
                          {status === 'installing' ? 'Saving…' : 'Save this to my Harvous'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="public-footer public-footer--rich">
                  <span className="public-footer__tag">
                    {/* Only the provenance is conditional. The invitation after it is one
                        sentence written once, so the two branches cannot drift apart, and
                        "study&nbsp;Bible" is held together — it is a compound, and the
                        shorter official line moved the break right into the middle of it. */}
                    {isOfficial
                      ? 'Included with Harvous.'
                      : 'Shared by someone using Harvous.'}{' '}
                    Start your own study&nbsp;Bible.{' '}
                    <a
                      href="https://harvous.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="public-footer__cta"
                    >
                      Try free →
                    </a>
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
