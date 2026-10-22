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

/** Which video this is, as a string — the identity the player is built and torn down on. */
export function playableVideoKey(video: PlayableVideo): string {
  return video.kind === 'youtube' ? `youtube:${video.id}` : `${video.kind}:${video.src}`;
}

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
  mediaKey,
  onMediaExpired,
}: {
  video: PlayableVideo;
  title: string;
  poster: string | null;
  durationSeconds: number | null;
  /** Whose video, for the play button's name: "Play “…” on BibleProject". */
  sourceName: string | null;
  /**
   * What the player is built on, when the video's own address is not stable. An uploaded
   * file plays from a signed URL that is re-minted every few minutes; keyed on that URL, each
   * re-mint would tear the playing video down and start it again from its poster.
   */
  mediaKey?: string;
  /**
   * A fresh address for a file whose signed URL has died under the playing video. The player
   * swaps it in and carries on from where it was, rather than stopping.
   */
  onMediaExpired?: () => Promise<string | null>;
}) {
  const [started, setStarted] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);

  /*
   * The player is built once per video and per press of play — and nothing else.
   *
   * Its effect depended on `video` and `poster`, and `video` is an object the parent makes
   * fresh on render. Any re-render was a teardown: the parent refetching on window focus (or
   * React Query re-running anything above it) destroyed the playing Plyr and rebuilt it on its
   * poster, which looked exactly like the video stopping by itself a minute in. Keyed on a
   * string instead, and everything else is read from refs at build time.
   */
  const key = mediaKey ?? playableVideoKey(video);
  const videoRef = useRef(video);
  videoRef.current = video;
  const posterRef = useRef(poster);
  posterRef.current = poster;
  const onMediaExpiredRef = useRef(onMediaExpired);
  onMediaExpiredRef.current = onMediaExpired;

  useEffect(() => {
    const video = videoRef.current;
    const poster = posterRef.current;
    if (!started || video.kind === 'frame') return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;
    let player: PlyrInstance | null = null;
    let media: HTMLElement | null = null;
    let cancelled = false;
    let reSigning = false;

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
        /* A signed URL lives ten minutes; a long video outlasts it, and the next range
           request fails. Re-sign once per failure and pick up where it stopped. */
        el.addEventListener('error', () => {
          const refresh = onMediaExpiredRef.current;
          if (!refresh || reSigning || cancelled) return;
          reSigning = true;
          const resumeAt = el.currentTime;
          const wasPlaying = !el.paused;
          void refresh()
            .then((fresh) => {
              if (cancelled || !fresh || fresh === el.currentSrc) return;
              el.src = fresh;
              el.addEventListener(
                'loadedmetadata',
                () => {
                  el.currentTime = resumeAt;
                  if (wasPlaying) void el.play().catch(() => {});
                },
                { once: true },
              );
              el.load();
            })
            .catch(() => {})
            .finally(() => {
              reSigning = false;
            });
        });
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
    // `key` stands for `video`; `poster` is only read when the player is first built.
  }, [started, key]);

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
