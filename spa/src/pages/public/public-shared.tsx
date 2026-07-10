import type { ReactNode } from 'react';
import { prototypeHomePath } from '@/lib/prototype-path';
import { writePendingAuthRedirect } from '../../lib/pending-auth-redirect';

/** Shared icons for public pages. */

/**
 * Harvous app-icon mark — same PNG as site-inspired sign-in/up (`/images/harvous-2-icon.png`).
 * Styling (size, iOS-like corner radius) lives in `.harvous-app-icon` CSS.
 */
export function HarvousLogoMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/images/harvous-2-icon.png"
      alt="Harvous"
      className="harvous-app-icon"
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

export function writePublicToolbarPendingRedirect(destination: string): boolean {
  return writePendingAuthRedirect(destination);
}

/**
 * Floating navbar pill rendered on every public/shared page. Contains the
 * app icon and a CTA pill at the right ("Open app" when signed in,
 * "Sign in" when not — the shared-page equivalent of the site's "Try free").
 * Pass `signedInCtaLabel` to override the signed-in copy (e.g. "Back to
 * Harvous" on /addon, where the visitor is already inside the app).
 */
export function PublicTopBar({
  isSignedIn,
  signedInCtaLabel = 'Open app',
}: {
  isSignedIn: boolean;
  signedInCtaLabel?: string;
}) {
  const redirectUrl = typeof window !== 'undefined' ? window.location.href : '';
  return (
    <nav className="public-toolbar">
      <div className="public-toolbar__pill">
        <a href="https://harvous.com" className="public-toolbar__brand">
          <HarvousLogoMark />
        </a>
        {isSignedIn ? (
          <a href={prototypeHomePath()} className="public-toolbar__cta">
            {signedInCtaLabel}
          </a>
        ) : (
          <a
            href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`}
            className="public-toolbar__cta"
            onClick={() => writePublicToolbarPendingRedirect(redirectUrl)}
          >
            Sign in
          </a>
        )}
      </div>
    </nav>
  );
}

/**
 * Shared "not found / unavailable" state for every public page. Renders the
 * error content *inside* the shared-note paper-stack motif (two fanned leaves
 * behind a rotated cream-paper card with dot grain + folded corner — see
 * `.public-paper-stack` / `.public-error-card` in `public-pages.css`) so the
 * empty state reads as part of the same letter-card design as a real note.
 */
export function PublicErrorState({
  icon,
  title,
  message,
  ctaHref,
  ctaLabel,
  ctaTarget,
  showFooter = true,
  footerLead = 'New to Harvous? Make your own study Bible.',
}: {
  icon?: ReactNode;
  title: string;
  message: ReactNode;
  /** Optional in-paper CTA. Omit on not-found states so the only call to
      action is the marketing footer below the card. */
  ctaHref?: string;
  ctaLabel?: string;
  /** Set to "_blank" for external (marketing) links. */
  ctaTarget?: '_blank';
  /** Show the "Make your own study Bible · Try free →" footer. Suppress for
      signed-in flows (e.g. invitation expired/accepted). */
  showFooter?: boolean;
  footerLead?: string;
}) {
  return (
    <div className="public-error">
      <div className="public-paper-stack public-paper-stack--error">
        <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
        <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
        <div className="public-error-card">
          {icon && <div className="public-error__icon">{icon}</div>}
          <h1 className="public-error__title">{title}</h1>
          <p className="public-error__message">{message}</p>
          {ctaHref && ctaLabel && (
            <a
              className="public-error__link"
              href={ctaHref}
              {...(ctaTarget === '_blank'
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              {ctaLabel}
              <span aria-hidden="true" className="public-error__link-arrow">→</span>
            </a>
          )}
        </div>
      </div>
      {showFooter && (
        <div className="public-footer public-footer--rich">
          <span className="public-footer__tag">
            {footerLead}{' '}
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
      )}
    </div>
  );
}
