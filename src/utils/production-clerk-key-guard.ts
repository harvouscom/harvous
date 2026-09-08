import { clearAppCachesThen } from './prototype-app-update-notice';

/**
 * Refuse to boot a development-Clerk bundle on a production host, and self-heal.
 *
 * `VITE_CLERK_PUBLISHABLE_KEY` is inlined at build time, so a `pk_test_` key in a bundle
 * running on app.harvous.com means the device is executing a build that production never
 * meant to serve. That happened once after the Netlify → Cloudflare cutover: an installed
 * PWA authenticated against the Clerk development instance and kept doing so, because
 * `public/sw.js` serves `/` stale-while-revalidate and `/assets/*` cache-first with no
 * revalidation. The only user-side cure was deleting and re-adding the home-screen install.
 *
 * The cure is now automatic: drop the service worker and every cache, then reload once.
 * A second failed attempt shows a plain screen rather than looping or signing the user in
 * against the wrong Clerk instance — which would silently create an account in the dev
 * instance and show none of their real notes.
 */

/** Hosts that must only ever run a `pk_live_` build. Both serve the same Worker. */
const PRODUCTION_HOSTS = new Set(['app.harvous.com', 'status.harvous.com']);

const RECOVERY_FLAG = 'harvous_dev_clerk_recovery_attempted';

function readFlag(): boolean | null {
  try {
    return sessionStorage.getItem(RECOVERY_FLAG) !== null;
  } catch (_) {
    // Private mode / storage blocked. Null means "cannot track attempts", which the caller
    // treats as "do not reload", so a broken storage API can never cause a reload loop.
    return null;
  }
}

function writeFlag(): void {
  try {
    sessionStorage.setItem(RECOVERY_FLAG, '1');
  } catch (_) {}
}

function clearFlag(): void {
  try {
    sessionStorage.removeItem(RECOVERY_FLAG);
  } catch (_) {}
}

function unregisterServiceWorkersThen(done: () => void): void {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
    done();
    return;
  }
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
    .then(done)
    .catch(done);
}

/** Unregister every worker, drop every cache, then run `done`. Always runs `done`. */
function purgeThen(done: () => void): void {
  unregisterServiceWorkersThen(() => clearAppCachesThen(done));
}

/**
 * Plain DOM, not React: this runs instead of mounting the app.
 *
 * The `!important` on the button colour is load-bearing. global.css sets
 * `button { color: var(--color-deep-grey) !important }`, and a bare inline colour loses to
 * it — which renders this button's label near-invisible, dark on dark.
 */
function renderRecoveryScreen(): void {
  const host = document.getElementById('root') ?? document.body;
  if (!host) return;
  host.innerHTML = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F7F7F6;padding:16px">
      <div style="text-align:center;padding:32px;max-width:400px;background:#fff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <p style="color:#4a473d;font-size:17px;line-height:1.5;margin:0 0 20px">Harvous is running an out-of-date copy of the app and cannot sign you in safely. Reload to get the current version.</p>
        <button type="button" id="harvous-dev-key-reload" style="background:#4a473d;color:#fff !important;-webkit-text-fill-color:#fff;border:none;padding:14px 28px;border-radius:12px;font-size:16px;cursor:pointer">Reload App</button>
      </div>
    </div>`;
  document.getElementById('harvous-dev-key-reload')?.addEventListener('click', () => {
    clearFlag();
    purgeThen(() => window.location.reload());
  });
}

/**
 * Returns true when the app must NOT boot: either a reload has been kicked off, or the
 * recovery screen is showing. Call before rendering anything that mounts Clerk.
 */
export function enforceProductionClerkKey(): boolean {
  if (typeof window === 'undefined') return false;
  if (!PRODUCTION_HOSTS.has(window.location.hostname)) return false;

  const isDevClerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_');
  if (!isDevClerkKey) {
    // A good bundle is running, so re-arm the one-shot recovery for any future incident.
    clearFlag();
    return false;
  }

  const alreadyAttempted = readFlag();
  if (alreadyAttempted === false) {
    writeFlag();
    purgeThen(() => window.location.reload());
    return true;
  }

  // Either the reload already happened and did not help, or attempts cannot be tracked.
  // Both cases need a human tap rather than another automatic reload.
  renderRecoveryScreen();
  return true;
}
