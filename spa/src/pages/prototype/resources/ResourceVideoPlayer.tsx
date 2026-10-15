/**
 * A saved video, played in the viewer — the Discover player, in the app.
 *
 * Same two halves as harvous.com's `DiscoverVideoEmbed`: a facade first (the poster, the
 * gradient play button, the running time), and the real player only on the press. Until then
 * nothing from the video's host loads — a resource you glance at and close never touches
 * YouTube — and Plyr itself is a lazy chunk the same click pays for.
 *
 * YouTube and direct video files play in Plyr, so both have the Discover controls. Vimeo
 * keeps its own player in a frame: Plyr's Vimeo mode loads Vimeo's script into the app, and
 * the CSP admits YouTube's API alone.
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/react/Icon';

export type PlayableVideo =
  | { kind: 'youtube'; id: string }
  | { kind: 'file'; src: string }
  | { kind: 'frame'; src: string };

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

type PlyrInstance = {
  play: () => Promise<void> | void;
  pause: () => void;
  destroy: () => void;
  once: (event: string, cb: () => void) => void;
};

export default function ResourceVideoPlayer({
  video,
  title,
  poster,
  durationSeconds,
  sourceName,
}: {
  video: PlayableVideo;
  title: string;
  poster: string | null;
  durationSeconds: number | null;
  /** Whose video, for the play button's name: "Play “…” on BibleProject". */
  sourceName: string | null;
}) {
  const [started, setStarted] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!started || video.kind === 'frame') return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;
    let player: PlyrInstance | null = null;
    let media: HTMLElement | null = null;
    let cancelled = false;

    void (async () => {
      const [{ default: Plyr }, { PLYR_OPTIONS }] = await Promise.all([
        import('plyr'),
        import('../../../lib/plyr-options'),
        import('plyr/dist/plyr.css'),
      ]);
      if (cancelled) return;
      /* Built by hand, not rendered: Plyr wraps and moves its target, and a node React
         believes it owns would be reconciled out from under it. */
      if (video.kind === 'youtube') {
        media = document.createElement('div');
        media.setAttribute('data-plyr-provider', 'youtube');
        media.setAttribute('data-plyr-embed-id', video.id);
      } else {
        const el = document.createElement('video');
        el.src = video.src;
        el.playsInline = true;
        el.preload = 'metadata';
        if (poster) el.poster = poster;
        media = el;
      }
      mount.appendChild(media);
      player = new Plyr(media, PLYR_OPTIONS as unknown as ConstructorParameters<typeof Plyr>[1]) as unknown as PlyrInstance;
      /* `once('ready')`, not play() straight away: Plyr only returns a promise once the
         provider's player exists — the website's lightbox learned this first. */
      player.once('ready', () => {
        const played = player?.play();
        if (played && typeof (played as Promise<void>).catch === 'function') {
          (played as Promise<void>).catch(() => {});
        }
      });
    })();

    return () => {
      cancelled = true;
      if (media instanceof HTMLVideoElement) {
        /* Not `destroy()`: for a file it swaps in Plyr's blank video from cdn.plyr.io. Stop
           the download ourselves; the container goes with the component. */
        media.pause();
        media.removeAttribute('src');
        media.load();
      } else {
        player?.destroy();
      }
      mount.replaceChildren();
    };
  }, [started, video, poster]);

  return (
    <figure className="proto-resource-video">
      <div className="proto-resource-video__frame">
        {started ? (
          video.kind === 'frame' ? (
            <iframe
              className="proto-resource-video__player"
              src={`${video.src}${video.src.includes('?') ? '&' : '?'}autoplay=1`}
              title={title}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div ref={mountRef} className="proto-resource-video__player" />
          )
        ) : (
          <button
            type="button"
            className="proto-resource-video__facade"
            aria-label={sourceName ? `Play “${title}” on ${sourceName}` : `Play “${title}”`}
            onClick={() => setStarted(true)}
          >
            {poster && !posterFailed ? (
              <img
                className="proto-resource-video__poster"
                src={poster}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setPosterFailed(true)}
              />
            ) : (
              <span className="proto-resource-video__poster proto-resource-video__poster--blank" aria-hidden />
            )}
            <span className="proto-resource-video__play proto-ink-on-accent" aria-hidden>
              <Icon name="play" size={20} />
            </span>
            {durationSeconds ? (
              <span className="proto-resource-video__time proto-ink-on-accent">{formatDuration(durationSeconds)}</span>
            ) : null}
          </button>
        )}
      </div>
    </figure>
  );
}
