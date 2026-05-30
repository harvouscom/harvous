import { prototypeHomePath } from '@/lib/prototype-path';

/** Shared icons for public pages. */

/**
 * Harvous app-icon mark — matches the `/site/` navbar exactly (`Header.astro`
 * uses `<img src="/icons/app-icon.png" class="h-6 w-6 rounded-md" />`).
 * The PNG is bundled under `spa/public/icons/app-icon.png`.
 */
export function HarvousLogoMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/icons/app-icon.png"
      alt="Harvous"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        display: 'block',
        objectFit: 'cover',
      }}
    />
  );
}

/**
 * Floating navbar pill rendered on every public/shared page. Contains the
 * Harvous brand chip and a CTA pill at the right ("Open app" when signed in,
 * "Sign in" when not — the shared-page equivalent of the site's "Try free").
 */
export function PublicTopBar({ isSignedIn }: { isSignedIn: boolean }) {
  const redirectUrl = typeof window !== 'undefined' ? window.location.href : '';
  return (
    <nav className="public-toolbar">
      <div className="public-toolbar__pill">
        <a href="https://harvous.com" className="public-toolbar__brand">
          <span className="public-toolbar__icon"><HarvousLogoMark size={22} /></span>
          <span className="public-toolbar__wordmark">Harvous</span>
        </a>
        {isSignedIn ? (
          <a href={prototypeHomePath()} className="public-toolbar__cta">
            Open app
          </a>
        ) : (
          <a
            href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`}
            className="public-toolbar__cta"
          >
            Sign in
          </a>
        )}
      </div>
    </nav>
  );
}

export function CircleQuestionIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
    </svg>
  );
}
