/**
 * The video player's settings — the same object harvous.com builds its players from
 * (`harvous.com/src/lib/plyr-options.ts`), so a video watched on Discover and one opened from
 * your Resources look and behave the same.
 *
 * The `youtube` block is a privacy promise, not a preference: no-cookie, and none of YouTube's
 * own chrome or end-screen recommendations competing with the video someone saved.
 *
 * Two things the website does not need and the app does: the icon sprite is served from our
 * own origin (Plyr's default fetches it from cdn.plyr.io, which the app's CSP refuses), and
 * nothing here points at Plyr's CDN for its blank video — see ResourceVideoPlayer's teardown.
 */
import plyrSpriteUrl from '../../../node_modules/plyr/dist/plyr.svg?url';

export const PLYR_OPTIONS = {
  controls: [
    'play-large',
    'play',
    'progress',
    'current-time',
    'duration',
    'mute',
    'volume',
    'settings',
    'fullscreen',
  ],
  settings: ['speed'],
  speed: { selected: 1, options: [0.75, 1, 1.25, 1.5, 2] },
  hideControls: true,
  keyboard: { focused: true, global: false },
  tooltips: { controls: true, seek: true },
  iconUrl: plyrSpriteUrl,
  youtube: { noCookie: true, rel: 0, modestbranding: 1, iv_load_policy: 3 },
} as const;
