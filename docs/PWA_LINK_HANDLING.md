# PWA link handling (open links in app)

So that join-space, shared-thread, and shared-note links can open in the **installed PWA** instead of the browser, the app uses PWA URL handling.

## What we use

- **`url_handlers`** in [public/manifest.json](../public/manifest.json): declares that the installed PWA can handle `https://app.harvous.com` URLs.
- **`launch_handler`** with `client_mode: "navigate-existing"`: when a link launches the PWA, the existing app window is navigated to that URL (no extra window).
- **`.well-known/web-app-origin-association`**: [public/.well-known/web-app-origin-association](../public/.well-known/web-app-origin-association) lets the browser verify that this origin allows the PWA to handle its URLs.

## Platform behavior

- **Chrome (Android/Desktop)**  
  Link handling only works when **Chrome is the device’s default browser**. If it is, links to `https://app.harvous.com` (e.g. from email or messages) can open in the installed Harvous PWA. On desktop, the feature may still be behind the flag `#enable-desktop-pwas-url-handling` in `about://flags`.

- **iOS / Safari**  
  Safari does **not** support PWA URL handling (`url_handlers` / `handle_links`). Links from Mail, Messages, etc. will open in Safari, not in the “Add to Home Screen” PWA. There is no PWA-only fix; Universal Links require a native app.

- **Re-install**  
  Users who already had the app installed may need to remove and re-add the PWA to Home Screen (or reinstall) so the updated manifest (with `url_handlers` and `launch_handler`) is picked up.

## Deployments other than app.harvous.com

The manifest and association file are set up for **https://app.harvous.com**. For another origin (e.g. staging):

1. Change `url_handlers[].origin` in `public/manifest.json` to that origin.
2. In `public/.well-known/web-app-origin-association`, set `manifest` to that origin’s manifest URL (e.g. `https://staging.harvous.com/manifest.json`).
