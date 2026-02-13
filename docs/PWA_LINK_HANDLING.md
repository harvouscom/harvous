# PWA link handling (open links in app)

So that join-space, shared-thread, and shared-note links can open in the **installed PWA** instead of the browser, the app uses PWA URL handling.

## What we use

- **`url_handlers`** in [public/manifest.json](../public/manifest.json): declares that the installed PWA can handle `https://app.harvous.com` URLs.
- **`launch_handler`** with `client_mode: "navigate-existing"`: when a link launches the PWA, the existing app window is navigated to that URL (no extra window).
- **`.well-known/web-app-origin-association`**: Served at `/.well-known/web-app-origin-association` (Netlify rewrites to the Astro endpoint [src/pages/well-known/web-app-origin-association.ts](../src/pages/well-known/web-app-origin-association.ts)) with `Content-Type: application/json`. The browser uses this to verify that this origin allows the PWA to handle its URLs. A static copy is also in [public/.well-known/web-app-origin-association](../public/.well-known/web-app-origin-association) for reference.

## Platform behavior

- **Chrome (Android/Desktop)**  
  Link handling only works when **Chrome is the device’s default browser**. If it is, links to `https://app.harvous.com` (e.g. from email or messages) can open in the installed Harvous PWA. On desktop, the feature may still be behind the flag `#enable-desktop-pwas-url-handling` in `about://flags`.

- **iOS / Safari**  
  Safari does **not** support PWA URL handling (`url_handlers` / `handle_links`). Links from Mail, Messages, etc. will open in Safari, not in the “Add to Home Screen” PWA. There is no PWA-only fix; Universal Links require a native app.

- **Re-install**  
  Users who already had the app installed may need to remove and re-add the PWA to Home Screen (or reinstall) so the updated manifest (with `url_handlers` and `launch_handler`) is picked up.

## Troubleshooting

- **Links still open in the browser**  
  Link handling only applies when the link is opened **from outside the browser** (e.g. Mail, Messages, Slack). Links opened **inside** the browser (e.g. from Gmail in a tab) are **not** handed off to the PWA by design.

- **Chrome must be the default browser**  
  PWA URL handling only works when Chrome is the device’s default browser. If another browser is default, links will open there instead of the PWA.

- **Desktop Chrome**  
  On desktop, the feature may be behind the flag `#enable-desktop-pwas-url-handling` in `about://flags`. Enable it to test.

- **iOS / Safari**  
  Safari does not support PWA URL handling. Links from Mail, Messages, etc. open in Safari, not in the “Add to Home Screen” PWA. There is no PWA-only fix; Universal Links require a native app.

- **After manifest or association changes**  
  Users may need to remove and re-add the PWA (or reinstall) so the browser re-validates the association.

## Deployments other than app.harvous.com

The manifest and association are set up for **https://app.harvous.com**. For another origin (e.g. staging):

1. Change `url_handlers[].origin` in `public/manifest.json` to that origin.
2. In [src/pages/well-known/web-app-origin-association.ts](../src/pages/well-known/web-app-origin-association.ts), set the `manifest` URL in the `ASSOCIATION` object to that origin’s manifest URL (e.g. `https://staging.harvous.com/manifest.json`).
