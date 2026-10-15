/**
 * The Resources tool's viewer: the resource itself, inside Harvous.
 *
 * Leaving for the source stays one press away ("Open outside"), but it is no longer the
 * only way to see what you saved. Each kind gets the best thing the browser can show for
 * it — reader view for an article, the host's own player for a video, the file drawn in
 * place — and anything it cannot show falls to a card of what we already know about it.
 */
import { lazy, Suspense, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { safeRenderHtml } from '@/utils/content-renderer';
import { resourceFileLabel, resourceSourceLabel } from '@/utils/resource-source-label';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import {
  resolveResourceViewer,
  type ResourceEmbed,
  type ResourceViewerKind,
} from '../../../utils/resource-viewer-kind';
import {
  useLibraryFileUrl,
  useResourceReader,
  type ResourceVideo,
} from '../../../hooks/queries/useLibrary';
import ResourceVideoPlayer, { type PlayableVideo } from './ResourceVideoPlayer';
import {
  effectiveResourceType,
  resourceTypeIcon,
  resourceTypeNoun,
  type ResourceType,
} from './resource-type-display';
import { followResource } from '../library-panel/use-open-resource';
import type { ResourceShelf } from '../PrototypeResourceLibraryList';

/* pdf.js is ~half a megabyte with its worker; only someone opening a PDF pays for it. */
const ResourcePdfView = lazy(() => import('./ResourcePdfView'));

/** Every shelf's item, flattened to what the viewer reads. */
export type ViewerResource = {
  source: ResourceShelf;
  id: string;
  kind: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceSiteName: string | null;
  sourceImage: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileBytes: number | null;
  resourceType?: string | null;
  createdAt: string | Date | null;
  /** Whose shelf, in words: "My Library", the church's name, "This space". */
  shelfLabel: string;
  leadersOnly: boolean;
  pinned: boolean;
};

/** Text files larger than this are offered as a download rather than drawn. */
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

function addedOn(value: string | Date | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `Added ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })}`;
}

/** Seconds as a player shows them: 5:17, 1:02:03. */
function formatRunningTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Whose it is, in a word or two: the publisher's name over its domain. */
function sourceNameOf(resource: ViewerResource): string | null {
  return resource.sourceSiteName || resource.sourceDomain || null;
}

/** The video a resource plays, from its link or from the page it links to. */
function playableFrom(
  viewer: ResourceViewerKind,
  pageVideo: ResourceVideo | null,
): { video: PlayableVideo; poster: string | null; durationSeconds: number | null } | null {
  if (viewer.kind === 'embed') {
    const { embed } = viewer;
    if (embed.provider === 'youtube' && embed.id) {
      return { video: { kind: 'youtube', id: embed.id }, poster: null, durationSeconds: null };
    }
    if (embed.provider === 'vimeo') return { video: { kind: 'frame', src: embed.src }, poster: null, durationSeconds: null };
    return null;
  }
  if (!pageVideo) return null;
  const rest = { poster: pageVideo.poster, durationSeconds: pageVideo.durationSeconds };
  if (pageVideo.kind === 'file') return { video: { kind: 'file', src: pageVideo.src }, ...rest };
  if (pageVideo.kind === 'youtube') return { video: { kind: 'youtube', id: pageVideo.id }, ...rest };
  const src = new URL(`https://player.vimeo.com/video/${pageVideo.id}`);
  if (pageVideo.hash) src.searchParams.set('h', pageVideo.hash);
  src.searchParams.set('dnt', '1');
  return { video: { kind: 'frame', src: src.toString() }, ...rest };
}

export default function PrototypeResourceViewer({
  resource,
  canDock,
  onDock,
  onClose,
}: {
  resource: ViewerResource;
  /** A note is open and this is a personal item, so it can sit in that note's dock. */
  canDock: boolean;
  onDock: () => void;
  onClose: () => void;
}) {
  const viewer = useMemo(() => resolveResourceViewer(resource), [resource]);
  /* Asked here rather than inside the reader: whether a link is an article or a video page
     decides the whole layout — the player leads, a video's page text is never shown. */
  const reader = useResourceReader(resource.id, { enabled: viewer.kind === 'reader' });
  const pageVideo = reader.data && !reader.data.readable && reader.data.reason === 'is_video' ? reader.data.video : null;
  const playable = playableFrom(viewer, pageVideo ?? null);
  const isFile = resource.kind === 'file';
  const isVideo = Boolean(playable) || viewer.kind === 'video';
  const article = viewer.kind === 'reader' && reader.data?.readable ? reader.data : null;

  const label = isVideo
    ? 'Video'
    : viewer.kind === 'embed' || viewer.kind === 'audio'
      ? 'Audio'
      : article
        ? 'Article'
        : viewer.kind === 'pdf'
          ? 'PDF'
          : viewer.kind === 'image'
            ? 'Image'
            : isFile
              ? 'File'
              : 'Link';

  const type = isVideo ? 'video' : effectiveResourceType(resource);
  /* Who it is from, then where: the publisher's name leads, its domain trails quietly. A file
     has no publisher — its own name and format stand in. */
  const bylineName = isFile ? (resource.fileName ?? resource.title) : sourceNameOf(resource);
  const bylineDetail = isFile
    ? resourceFileLabel(resource.fileMime, resource.fileBytes, resource.fileName)
    : resource.sourceSiteName && resource.sourceDomain
      ? resource.sourceDomain.replace(/^www\./, '')
      : null;
  const meta = [
    article ? `${Math.max(1, Math.round(article.wordCount / 230))} min read` : null,
    playable?.durationSeconds ? formatRunningTime(playable.durationSeconds) : null,
    /* Whose shelf only when it is not yours — "My Library" on your own items was noise. */
    resource.source === 'mine' ? null : resource.shelfLabel,
    resource.leadersOnly ? 'Leaders' : null,
    resource.pinned ? 'Pinned' : null,
    addedOn(resource.createdAt),
  ]
    .filter(Boolean)
    .join('  ·  ');

  const key = `${resource.source}:${resource.id}`;
  const head = (
    <header className="proto-resource-viewer__head">
      <div className="proto-resource-byline">
        <SourceMark key={key} resource={resource} type={type} />
        <p className="proto-resource-byline__text">
          {bylineName ? <span className="proto-resource-byline__name">{bylineName}</span> : null}
          {bylineDetail ? <span className="proto-resource-byline__detail">{bylineDetail}</span> : null}
        </p>
        <span className="proto-resource-byline__type">
          <Icon name={resourceTypeIcon(type)} size={10} aria-hidden />
          {resourceTypeNoun(type)}
        </span>
      </div>
      <h2 className="proto-resource-viewer__title">{resource.title}</h2>
      {meta ? <p className="proto-caption proto-resource-viewer__meta">{meta}</p> : null}
      {canDock ? (
        <div className="proto-resource-viewer__actions">
          {/* What "open" used to do from inside a note: keep it beside the writing. */}
          <button type="button" className="proto-settings-btn proto-settings-btn--secondary" onClick={onDock}>
            Add to note
          </button>
        </div>
      ) : null}
    </header>
  );

  return (
    <aside className="proto-planner-editor proto-resource-viewer" aria-label={resource.title}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">{label}</span>
        <div className="proto-side-panel__header-actions">
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title={isFile ? 'Open file outside Harvous' : 'Open link outside Harvous'}
            aria-label={isFile ? 'Open file outside Harvous' : 'Open link outside Harvous'}
            onClick={() => followResource(resource)}
          >
            <Icon name="arrow-up-right-from-square" size={12} />
          </button>
          <button type="button" className="proto-side-panel__action-btn" title="Close" aria-label="Close viewer" onClick={onClose}>
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>

      <div className="proto-planner-editor__body proto-resource-viewer__body">
        <div className="proto-resource-viewer__scroll">
          {playable ? (
            /* Discover's order: the video, then what it is. Keyed so a new selection starts
               back on its poster rather than inheriting the last one's player. */
            <>
              <ResourceVideoPlayer
                key={key}
                video={playable.video}
                title={resource.title}
                poster={playable.poster ?? resource.sourceImage}
                durationSeconds={playable.durationSeconds}
                sourceName={sourceNameOf(resource)}
              />
              {head}
              {resource.description ? (
                <p className="proto-resource-viewer__description">{resource.description}</p>
              ) : null}
            </>
          ) : viewer.kind === 'video' ? (
            <>
              <FileVideo key={key} resource={resource} />
              {head}
            </>
          ) : viewer.kind === 'reader' ? (
            <>
              {head}
              <ReaderView key={key} resource={resource} reader={reader} />
            </>
          ) : (
            <>
              {head}
              <ResourceViewerContent key={key} resource={resource} viewer={viewer} />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

/**
 * The publisher's own icon, from its own site — the same mark the browser tab would show.
 * A site without one at the usual path, or a file, wears its type's glyph on a tile instead,
 * so the byline never has a hole where the mark should be.
 */
function SourceMark({ resource, type }: { resource: ViewerResource; type: ResourceType }) {
  const [failed, setFailed] = useState(false);
  const domain = resource.kind === 'link' ? resource.sourceDomain : null;
  if (domain && !failed) {
    return (
      <img
        className="proto-resource-byline__mark"
        src={`https://${domain.replace(/^https?:\/\//, '')}/favicon.ico`}
        alt=""
        width={20}
        height={20}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="proto-resource-byline__mark proto-resource-byline__mark--glyph" aria-hidden>
      <Icon name={resourceTypeIcon(type)} size={11} />
    </span>
  );
}

function ResourceViewerContent({
  resource,
  viewer,
}: {
  resource: ViewerResource;
  viewer: ResourceViewerKind;
}) {
  switch (viewer.kind) {
    case 'embed':
      /* Only Spotify reaches here: YouTube and Vimeo became players above. */
      return <AudioEmbed resource={resource} embed={viewer.embed} />;
    case 'image':
    case 'audio':
    case 'pdf':
    case 'text':
      return <FileView resource={resource} kind={viewer.kind} />;
    case 'card':
    default:
      return <ResourceCard resource={resource} />;
  }
}

/** What we know without opening it: the image and blurb saved with it, and the way out. */
function ResourceCard({ resource, notice }: { resource: ViewerResource; notice?: string }) {
  const isFile = resource.kind === 'file';
  return (
    <div className="proto-resource-card">
      <ResourceHero resource={resource} />
      {resource.description ? (
        <p className="proto-resource-viewer__description">{resource.description}</p>
      ) : null}
      <div className="proto-resource-card__out">
        {notice ? <p className="proto-caption proto-resource-card__notice">{notice}</p> : null}
        <button
          type="button"
          className="proto-share-popover__primary proto-ink-on-accent proto-resource-card__open"
          onClick={() => followResource(resource)}
        >
          {isFile ? 'Open file' : `Open on ${sourceNameOf(resource) ?? 'the site'}`}
          <Icon name="arrow-up-right-from-square" size={11} />
        </button>
      </div>
    </div>
  );
}

function ResourceHero({ resource }: { resource: ViewerResource }) {
  /* A dead OG image is common and says nothing useful; drop it rather than show a broken
     frame above the title. Unmounted, not `hidden` — the hero's own `display: block` beats
     the attribute. */
  const [failed, setFailed] = useState(false);
  if (!resource.sourceImage || failed) return null;
  return (
    <img
      className="proto-resource-viewer__hero"
      src={resource.sourceImage}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

function AudioEmbed({ resource, embed }: { resource: ViewerResource; embed: ResourceEmbed }) {
  return (
    <div className="proto-resource-embed-wrap">
      <div className={`proto-resource-embed proto-resource-embed--${embed.shape}`}>
        <iframe
          src={embed.src}
          title={resource.title}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {resource.description ? (
        <p className="proto-resource-viewer__description">{resource.description}</p>
      ) : null}
    </div>
  );
}

/** An uploaded video, in the same player as a saved one. */
function FileVideo({ resource }: { resource: ViewerResource }) {
  const file = useLibraryFileUrl(resource.id);
  if (file.isPending) return <ProtoSpaceLoading label="Loading video" />;
  if (file.isError || !file.data?.url) return null;
  return (
    <ResourceVideoPlayer
      video={{ kind: 'file', src: file.data.url }}
      title={resource.title}
      poster={resource.sourceImage}
      durationSeconds={null}
      sourceName={null}
    />
  );
}

/**
 * The article's own HTML, made fit to sit under our header.
 *
 * Extractors keep the page's headline as the article's first heading, so the title showed
 * twice, one under the other. Dropped when it says what our title already says.
 */
function readerMarkup(html: string, title: string): string {
  const clean = safeRenderHtml(html);
  if (typeof DOMParser === 'undefined') return clean;
  const doc = new DOMParser().parseFromString(`<div>${clean}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return clean;
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const first = root.querySelector('h1, h2');
  const leading = root.firstElementChild;
  if (first && (first === leading || leading?.contains(first)) && norm(first.textContent ?? '') === norm(title)) {
    first.remove();
  }
  return root.innerHTML;
}

function ReaderView({
  resource,
  reader,
}: {
  resource: ViewerResource;
  reader: ReturnType<typeof useResourceReader>;
}) {
  const article = reader.data?.readable ? reader.data : null;
  const html = useMemo(
    () => (article ? { __html: readerMarkup(article.html, resource.title) } : null),
    [article, resource.title],
  );

  if (reader.isPending) return <ProtoSpaceLoading label="Loading article" />;
  if (!html) {
    return (
      <ResourceCard
        resource={resource}
        notice="This page can’t be shown here — some sites only open in the browser."
      />
    );
  }

  /* The article's own links would navigate the app's window; send them out instead. */
  const onClick = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as Element).closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href');
    if (!href) return;
    try {
      const url = new URL(href, resource.sourceUrl ?? undefined);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        window.open(url.toString(), '_blank', 'noopener,noreferrer');
      }
    } catch {
      /* A malformed href in someone else's article is not ours to fix. */
    }
  };

  const site = sourceNameOf(resource) ?? 'the site';
  return (
    <article className="proto-resource-reader" onClick={onClick}>
      <ResourceHero resource={resource} />
      <div className="proto-resource-reader__body" dangerouslySetInnerHTML={html} />
      {/* The end of the text, said plainly: reader view keeps the words and leaves the rest
          — images the extractor dropped, comments, the site's own layout. */}
      <footer className="proto-resource-reader__footer">
        <p className="proto-caption">Reader view shows the article’s text. The original may have more.</p>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-resource-reader__original"
          onClick={() => followResource(resource)}
        >
          Read on {site}
          <Icon name="arrow-up-right-from-square" size={11} />
        </button>
      </footer>
    </article>
  );
}

function FileView({
  resource,
  kind,
}: {
  resource: ViewerResource;
  kind: 'image' | 'audio' | 'pdf' | 'text';
}) {
  const tooBigForText = kind === 'text' && (resource.fileBytes ?? 0) > TEXT_PREVIEW_MAX_BYTES;
  const file = useLibraryFileUrl(resource.id, { enabled: !tooBigForText });
  /* A signed URL can die under a viewer left open; mint one more, once, before giving up. */
  const retried = useRef(false);
  const onMediaError = () => {
    if (retried.current) return;
    retried.current = true;
    void file.refetch();
  };

  if (tooBigForText) return <ResourceCard resource={resource} notice="Too long to show here." />;
  if (file.isPending) return <ProtoSpaceLoading label="Loading file" />;
  if (file.isError || !file.data?.url) {
    return <ResourceCard resource={resource} notice="This file couldn’t be loaded." />;
  }
  const url = file.data.url;

  switch (kind) {
    case 'image':
      return (
        <div className="proto-resource-file proto-resource-file--image">
          <img src={url} alt={resource.title} onError={onMediaError} />
        </div>
      );
    case 'audio':
      return (
        <div className="proto-resource-file proto-resource-file--audio">
          <audio src={url} controls preload="metadata" onError={onMediaError} />
        </div>
      );
    case 'pdf':
      return (
        <Suspense fallback={<ProtoSpaceLoading label="Opening PDF" />}>
          <ResourcePdfView
            url={url}
            title={resource.title}
            fallback={<ResourceCard resource={resource} notice="This PDF couldn’t be shown here." />}
          />
        </Suspense>
      );
    case 'text':
    default:
      return <TextFileView resource={resource} url={url} />;
  }
}

function TextFileView({ resource, url }: { resource: ViewerResource; url: string }) {
  const text = useQuery({
    queryKey: ['library-file-text', resource.id],
    staleTime: 5 * 60 * 1000,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  });
  if (text.isPending) return <ProtoSpaceLoading label="Loading file" />;
  if (text.isError) return <ResourceCard resource={resource} notice="This file couldn’t be loaded." />;
  return <pre className="proto-resource-file proto-resource-file--text">{text.data}</pre>;
}

