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
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { resourceSourceLabel } from '@/utils/resource-source-label';
import { toast } from '@/utils/toast';
import Icon from '@/components/react/Icon';
import {
  DISCOVER_RESOURCE_TYPE_ICON,
  DISCOVER_RESOURCE_TYPE_NOUN,
  discoverArtPosition,
  discoverDocumentArt,
} from '../prototype/discover-display';

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
      const already = result.alreadyInstalled;
      setStatus(already ? 'already' : 'done');
      clearPendingAuthRedirect();
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* ignore */
      }
      /* The real app toast, not a page-local one — it survives the navigation
         below because `<Toaster>` is mounted once at the app root (App.tsx),
         a sibling of the router, not per-page. Same call and copy shape as
         the in-app Discover install (PrototypeBrowseTemplatesSheet's
         handleInstall), so a link from harvous.com resolves in the same
         voice as picking Discover from inside the app. */
      const title = listing?.title ?? 'that';
      toast.success(already ? `"${title}" is already in your Harvous` : `Saved "${title}" to your Harvous`);
      /* Always lands somewhere — the note itself when there is one, otherwise
         Home, same as the toolbar's "Open app". A brief delay, not a page-local
         hold: the toast is already on screen and keeps playing through the
         transition, so this is a beat to register the click landed, not a wait
         to finish reading anything. */
      const noteId = result.createdIds?.noteId;
      const destination = noteId ? noteUrlForCurrentSurface(noteId) : prototypeHomeRouteTo();
      window.setTimeout(() => {
        void navigate({ to: destination as never });
      }, 350);
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

  /* The structure is the honest preview of a starter and the note titles are the
     honest preview of a series. Neither is the body — taking a copy is what hands
     that over. */
  const outline: string[] = listing?.preview?.headings ?? listing?.preview?.titles ?? [];
  /* A link has no "inside" to promise — it is a pointer, not authored content —
     so it skips the outline card entirely and shows where it points instead. */
  const isResource = listing?.kind === 'resource';
  const resourceType = listing?.preview?.resourceType ?? null;
  /* Same table PrototypeExpandedDiscover's in-app browsing row reads — a link looks like the
     same thing whether it was found browsing or arrived from a share, not a second vocabulary
     invented for this one page. */
  const resourceIcon = (resourceType && DISCOVER_RESOURCE_TYPE_ICON[resourceType]) || 'newspaper';
  const resourceTypeNoun = resourceType ? DISCOVER_RESOURCE_TYPE_NOUN[resourceType] : null;
  const video = isResource ? (listing?.preview?.video ?? null) : null;
  const durationLabel = video?.durationLabel;
  const sourceLabel = isResource
    ? resourceSourceLabel(listing?.preview?.sourceDomain, listing?.preview?.sourceSiteName)
    : '';
  /* The panel never draws the resource's own photo — every kind wears the same icon-tile
     treatment — so the background behind that tile is the same generated art the site itself
     falls back to for a picture-less card, deterministic per slug (`discoverDocumentArt` /
     `discoverArtPosition`), not derived from the resource's own thumbnail. A listing looks like
     the same thing on both products, including a video's: the real frame is harvous.com's own
     poster to draw, never this repo's to fetch. */
  const panelArt = isResource ? discoverDocumentArt(listing?.slug) : null;
  const panelArtPosition = isResource ? discoverArtPosition(listing?.slug) : null;

  const kindNoun =
    listing?.kind === 'pack'
      ? 'Thread'
      : listing?.kind === 'note'
        ? 'note'
        : listing?.kind === 'resource'
          ? (resourceTypeNoun?.toLowerCase() ?? 'link')
          : 'template';

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
                  {listing.authorDisplayName
                    ? `A ${kindNoun} shared by ${listing.authorDisplayName}`
                    : `A ${kindNoun} shared on Harvous`}
                </p>

                <div className={`public-card${isResource ? ' public-card--resource' : ''}`}>
                  {isResource ? (
                    <div
                      className="public-card__panel"
                      style={
                        panelArt
                          ? { backgroundImage: `url(${panelArt})`, backgroundPosition: panelArtPosition ?? undefined }
                          : undefined
                      }
                    >
                      <span className="public-card__panel-icon" aria-hidden>
                        <Icon name={resourceIcon} size={40} />
                      </span>
                      {durationLabel ? (
                        <span className="public-card__panel-duration">{durationLabel}</span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="public-card__header">
                    <h1 className="public-card__title">{listing.title}</h1>
                    {listing.description ? (
                      <p className="public-card__meta">{listing.description}</p>
                    ) : null}
                    {sourceLabel ? (
                      <p className="public-card__source">{sourceLabel}</p>
                    ) : null}
                  </div>

                  {isResource ? null : (
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
                  )}

                  {/* `public-card__cta` is the pinned footer, not the button —
                      it sets `pointer-events: none` and the button inside takes
                      them back. `public-cta-btn` is the button. A resource card
                      (no scroll area to float over) drops the pin — see
                      `.public-card--resource .public-card__cta` in public-pages.css.
                      One button carries every state through to "Saved" rather than
                      swapping in a separate confirmation block — the celebration
                      itself is the toast fired from `doInstall`, not anything here. */}
                  <div className="public-card__cta">
                    {message ? (
                      <div className="public-invite-message" role="alert">
                        {message}
                      </div>
                    ) : null}
                    <div className="public-card__cta-row">
                      <button
                        type="button"
                        className="public-cta-btn"
                        disabled={status === 'installing' || status === 'done' || status === 'already'}
                        onClick={handlePress}
                      >
                        {status === 'installing'
                          ? 'Saving…'
                          : status === 'done' || status === 'already'
                            ? 'Saved'
                            : 'Save this to my Harvous'}
                      </button>
                      {/* The site's own listing page pairs the primary action with a secondary
                          one in this same outline style (there, the publisher's own link) — the
                          equivalent escape hatch here, since this page has no browsing of its
                          own to fall back into, is the hub the visitor actually came from. Held
                          off once the primary has already fired: about to navigate away, a
                          second destination is a decision nobody asked to make in that instant. */}
                      {isResource && status !== 'done' && status !== 'already' ? (
                        <a
                          href="https://harvous.com/discover/"
                          className="public-cta-btn public-cta-btn--secondary"
                        >
                          Back to Discover
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="public-footer public-footer--rich">
                  <span className="public-footer__tag">
                    {/* Not "shared by someone using Harvous" — a catalog listing wasn't, even
                        when the byline above names a person, since the whole point of Discover
                        is that anyone can take it, not just whoever it was shared with. */}
                    Discovered on Harvous. Start your own study Bible.{' '}
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
