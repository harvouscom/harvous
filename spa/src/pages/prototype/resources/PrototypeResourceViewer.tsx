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
import { useLibraryFileUrl, useResourceReader } from '../../../hooks/queries/useLibrary';
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
  const isFile = resource.kind === 'file';
  const source = isFile
    ? resourceFileLabel(resource.fileMime, resource.fileBytes, resource.fileName)
    : resourceSourceLabel(resource.sourceDomain, resource.sourceSiteName);
  const meta = [
    source,
    resource.shelfLabel,
    resource.leadersOnly ? 'Leaders' : null,
    resource.pinned ? 'Pinned' : null,
    addedOn(resource.createdAt),
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <aside className="proto-planner-editor proto-resource-viewer" aria-label={resource.title}>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">{isFile ? 'File' : 'Link'}</span>
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
          <button
            type="button"
            className="proto-side-panel__action-btn"
            title="Close"
            aria-label="Close viewer"
            onClick={onClose}
          >
            <Icon name="xmark" size={12} />
          </button>
        </div>
      </div>

      <div className="proto-planner-editor__body proto-resource-viewer__body">
        <div className="proto-resource-viewer__scroll">
          <header className="proto-resource-viewer__head">
            <h3 className="proto-church-content__title">{resource.title}</h3>
            {meta ? <p className="proto-caption proto-resource-viewer__meta">{meta}</p> : null}
            {canDock ? (
              <div className="proto-resource-viewer__actions">
                {/* What "open" used to do from inside a note: keep it beside the writing. */}
                <button
                  type="button"
                  className="proto-settings-btn proto-settings-btn--secondary"
                  onClick={onDock}
                >
                  Add to note
                </button>
              </div>
            ) : null}
          </header>

          {/* Keyed so a new selection starts its media and fetches fresh. */}
          <ResourceViewerContent key={`${resource.source}:${resource.id}`} resource={resource} viewer={viewer} />
        </div>
      </div>
    </aside>
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
      return <EmbedView resource={resource} embed={viewer.embed} />;
    case 'reader':
      return <ReaderView resource={resource} />;
    case 'image':
    case 'video':
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
      {notice ? <p className="proto-caption proto-resource-card__notice">{notice}</p> : null}
      {resource.description ? (
        <p className="proto-resource-card__description">{resource.description}</p>
      ) : null}
      <button
        type="button"
        className="proto-share-popover__primary proto-ink-on-accent proto-resource-card__open"
        onClick={() => followResource(resource)}
      >
        {isFile ? 'Open file' : `Open on ${resource.sourceSiteName || resource.sourceDomain || 'the site'}`}
      </button>
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

function EmbedView({ resource, embed }: { resource: ViewerResource; embed: ResourceEmbed }) {
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
        <p className="proto-resource-card__description">{resource.description}</p>
      ) : null}
    </div>
  );
}

function ReaderView({ resource }: { resource: ViewerResource }) {
  const reader = useResourceReader(resource.id);
  const html = useMemo(
    () =>
      reader.data?.readable ? { __html: safeRenderHtml(reader.data.html) } : null,
    [reader.data],
  );

  if (reader.isPending) return <ProtoSpaceLoading label="Loading article" />;
  if (reader.isError || !reader.data?.readable || !html) {
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

  const minutes = Math.max(1, Math.round(reader.data.wordCount / 230));
  return (
    <article className="proto-resource-reader" onClick={onClick}>
      <ResourceHero resource={resource} />
      <p className="proto-caption proto-resource-reader__byline">
        Reader view · {minutes} min read
      </p>
      <div className="proto-resource-reader__body" dangerouslySetInnerHTML={html} />
      <footer className="proto-resource-reader__footer">
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary"
          onClick={() => followResource(resource)}
        >
          Read on {resource.sourceSiteName || resource.sourceDomain || 'the site'}
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
  kind: 'image' | 'video' | 'audio' | 'pdf' | 'text';
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
    case 'video':
      return (
        <div className="proto-resource-file proto-resource-file--video">
          <video src={url} controls preload="metadata" playsInline onError={onMediaError} />
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

