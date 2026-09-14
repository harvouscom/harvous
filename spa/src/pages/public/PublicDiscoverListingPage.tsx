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
import Icon from '@/components/react/Icon';
import {
  DISCOVER_RESOURCE_TYPE_ICON,
  DISCOVER_RESOURCE_TYPE_NOUN,
  discoverArtPosition,
  discoverDocumentArt,
} from '../prototype/discover-display';

const PENDING_KEY = 'pendingDiscoverInstall';
const PENDING_TTL_MS = 600_000;
/** Read by App.tsx's PendingDiscoverToastBridge — own sibling constant there. */
const PENDING_DISCOVER_TOAST_KEY = 'pendingDiscoverToast';

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
      /* The real app toast, not a page-local one — same call and copy shape as the in-app
         Discover install (PrototypeBrowseTemplatesSheet's handleInstall), so a link from
         harvous.com resolves in the same voice as picking Discover from inside the app.
         Stashed for App.tsx's PendingDiscoverToastBridge to fire, rather than called here:
         this page has no sidebar for either toast renderer to centre against, and Sonner's
         own placement is viewport-relative, so firing it here looked fine on this empty page
         and then read as stuck off to the side once the sidebar it never knew about appeared
         underneath it after the navigate below. */
      const title = listing?.title ?? 'that';
      const toastMessage = already
        ? `"${title}" is already in your Harvous`
        : `Saved "${title}" to your Harvous`;
      try {
        sessionStorage.setItem(PENDING_DISCOVER_TOAST_KEY, JSON.stringify({ message: toastMessage }));
      } catch {
        /* ignore */
      }
      /* Always lands somewhere — the note itself when there is one, otherwise
         Home, same as the toolbar's "Open app". A brief delay, not a page-local
         hold: it is a beat to register the click landed, not a wait to finish
         reading anything — the toast itself only appears once we get there. */
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

  /*
   * Who to credit, and whether there is anything to take.
   *
   * `preview.official` means Harvous published this itself. It changes the kicker
   * and the footer — the account that ran the seed is not the author, and a
   * built-in has no `NoteTemplates` row to name one from. That much is true of
   * any kind Harvous might ever publish, so `isOfficial` alone still drives both.
   *
   * It does **not** alone mean the reader already has it. Only a *template*
   * ships in `getBuiltInTemplates()` and is already in every account under the
   * browse sheet's "Included" tab — a note, pack, or resource has no such
   * pre-installed twin, however the admin checkbox happens to be ticked. `isBuiltIn`
   * is the narrower fact and is what gates every "there is nothing to install"
   * behavior below; `isOfficial` on its own stays copy-only.
   */
  const isOfficial = Boolean(listing?.preview?.official);
  const isBuiltIn = isOfficial && listing?.kind === 'template';

  /* Replay after Clerk returns. Also covers ?install=1 arriving already signed
     in, which is the common case for someone who is logged in on this device. */
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !listing || startedRef.current) return;
    /* Nothing to replay for a built-in — signing up *is* what hands it over,
       and the server refuses the install as `ALREADY_INCLUDED`. Without this, a
       visitor who pressed "Get Harvous free" would come back from sign-up to an
       error on the template they had just been given. Any other official kind
       still has a real install waiting, so it replays normally. */
    if (isBuiltIn) return;
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
    if (isSignedIn && !isBuiltIn) {
      void doInstall();
      return;
    }
    /* A built-in parks nothing: there is no install waiting on the other side of
       sign-up, only the account that already includes it. */
    if (!isBuiltIn) {
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
                  <div
                    className={`public-card${onPaper ? ' public-card--paper' : ''}${isResource ? ' public-card--resource' : ''}`}
                  >
                  {isResource ? (
                    // The pinned CTA below needs the panel + header to be what scrolls, not the
                    // whole card, so a short viewport (a panel's own 220px floor plus a title and
                    // description can outgrow it) never pushes the buttons out of reach — same
                    // `.public-card__scroll` the outline list below scrolls under for template
                    // and note, reused for different children.
                    <div className="public-card__scroll">
                      <div
                        className="public-card__panel"
                        style={
                          panelArt
                            ? {
                                backgroundImage: `url(${panelArt})`,
                                backgroundPosition: panelArtPosition ?? undefined,
                              }
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

                      <div className="public-card__header">
                        <h1 className="public-card__title">{listing.title}</h1>
                        {listing.description ? (
                          <p className="public-card__meta">{listing.description}</p>
                        ) : null}
                        {sourceLabel ? (
                          <p className="public-card__source">{sourceLabel}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}

                  {/* `public-card__cta` is the pinned footer, not the button —
                      it sets `pointer-events: none` and the button inside takes
                      them back. `public-cta-btn` is the button, pinned over the
                      `.public-card__scroll` above (resource or outline) so it is
                      never pushed out of a short viewport. One button carries
                      every state through to "Saved" rather than swapping in a
                      separate confirmation block — the celebration itself is the
                      toast fired from `doInstall`, not anything here. */}
                  <div className="public-card__cta">
                    {message ? (
                      <div className="public-invite-message" role="alert">
                        {message}
                      </div>
                    ) : null}
                    <div className="public-card__cta-row">
                      {/*
                        A built-in is not something you take — it ships with the app,
                        under the browse sheet's "Included" tab, from
                        `getBuiltInTemplates()`. So a member already has it, and there
                        is nothing to press; for a visitor the honest action is not
                        "save this" but "get Harvous", because an account is the whole
                        thing that hands it over. Offering "Save this to my Harvous"
                        for both was the button promising a copy nobody needs — and
                        the server would have minted a duplicate to keep the promise.

                        Gated on `isBuiltIn`, not `isOfficial`: only a template has a
                        pre-installed twin. An official note or pack still needs a real
                        install, so it falls through to the ordinary button below.
                      */}
                      {isBuiltIn ? (
                        isSignedIn ? (
                          <div className="public-already-member" role="status">
                            This one is already in your templates.
                          </div>
                        ) : (
                          <button type="button" className="public-cta-btn" onClick={handlePress}>
                            Get Harvous free
                          </button>
                        )
                      ) : (
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
                      )}
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
