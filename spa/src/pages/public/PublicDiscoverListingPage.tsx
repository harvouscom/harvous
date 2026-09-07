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
import { prototypeDiscoverRouteTo } from '@/lib/prototype-path';
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
      /* Land on the thing they just took when there is one to open; otherwise
         the catalog, which is where a template or a link goes. */
      const noteId = result.createdIds?.noteId;
      const destination = noteId ? noteUrlForCurrentSurface(noteId) : prototypeDiscoverRouteTo();
      window.setTimeout(() => {
        void navigate({ to: destination as never });
      }, 900);
    } catch (error) {
      startedRef.current = false;
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not save that.');
    }
  }

  /* Replay after Clerk returns. Also covers ?install=1 arriving already signed
     in, which is the common case for someone who is logged in on this device. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !listing || startedRef.current) return;
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
    if (isSignedIn) {
      void doInstall();
      return;
    }
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({ slug, timestamp: Date.now() }));
    } catch {
      /* ignore */
    }
    writePendingAuthRedirect(window.location.href);
    // Sign-up, not sign-in: this visitor came from marketing.
    void navigate({
      to: `/sign-up?redirect_url=${encodeURIComponent(window.location.href)}` as never,
    });
  }

  if (status === 'error' && !listing) {
    return (
      <>
        <PublicTopBar isSignedIn={Boolean(isSignedIn)} />
        <PublicErrorState
          title="We couldn't find that"
          message="It may have been taken back by whoever shared it."
        />
      </>
    );
  }

  return (
    <>
      <PublicTopBar isSignedIn={Boolean(isSignedIn)} />
      <div className="public-shared-note">
        <div className="public-shared-note__card">
          <h1 className="public-shared-note__title">{listing?.title ?? 'Loading…'}</h1>
          {listing?.description ? (
            <p className="public-shared-note__meta">{listing.description}</p>
          ) : null}
          {listing?.authorDisplayName ? (
            <p className="public-shared-note__meta">Shared by {listing.authorDisplayName}</p>
          ) : null}

          {status === 'done' ? (
            <p className="public-shared-note__meta">Saved. Taking you to it…</p>
          ) : status === 'already' ? (
            <p className="public-shared-note__meta">This is already in your Harvous.</p>
          ) : (
            <button
              type="button"
              className="proto-share-popover__primary"
              disabled={status === 'installing' || status === 'loading'}
              onClick={handlePress}
            >
              {status === 'installing' ? 'Saving…' : 'Save this to my Harvous'}
            </button>
          )}

          {message ? (
            <p className="public-shared-note__meta" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
