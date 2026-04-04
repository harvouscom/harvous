import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../lib/api';
import type { FeaturedItem } from '../hooks/queries/useFeaturedItems';
import { generateAccentMeshGradient } from '../../../src/utils/colors';
import Icon from '@/components/react/Icon';

function dismissKey(featuredItemId: string) {
  return `dismissed_featured_${featuredItemId}`;
}

export function readDismissedFeaturedItem(featuredItemId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(featuredItemId)) === '1';
  } catch {
    return false;
  }
}

function writeDismissedFeaturedItem(featuredItemId: string) {
  try {
    localStorage.setItem(dismissKey(featuredItemId), '1');
  } catch {
    /* ignore */
  }
}

function getIconForContentType(contentType: FeaturedItem['contentType']) {
  if (contentType === 'space') {
    // user-group
    return (
      <svg fill="currentColor" viewBox="0 0 640 512" aria-hidden="true">
        <path d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304l91.4 0C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7L29.7 512C13.3 512 0 498.7 0 482.3zM609.3 512l-137.8 0c5.4-9.4 8.6-20.3 8.6-32l0-8c0-60.7-27.1-115.2-69.8-151.8c2.4-.1 4.7-.2 7.1-.2l61.4 0C567.8 320 640 392.2 640 481.3c0 17-13.8 30.7-30.7 30.7zM432 256c-31 0-59-12.6-79.3-32.9C372.4 196.5 384 163.6 384 128c0-26.8-6.6-52.1-18.3-74.3C384.3 40.1 407.2 32 432 32c61.9 0 112 50.1 112 112s-50.1 112-112 112z" />
      </svg>
    );
  }
  if (contentType === 'thread') {
    return <Icon name="layer-group" size={20} />;
  }
  if (contentType === 'recall') {
    return (
      <svg fill="currentColor" viewBox="0 0 512 512" aria-hidden="true">
        <path d="M75 75L41 41C25.9 25.9 0 36.6 0 57.9L0 168c0 13.3 10.7 24 24 24l110.1 0c21.4 0 32.1-25.9 17-41l-30.8-30.8C155 85.5 203 64 256 64c106 0 192 86 192 192s-86 192-192 192c-40.8 0-78.6-12.7-109.7-34.4c-14.5-10.1-34.4-6.6-44.6 7.9s-6.6 34.4 7.9 44.6C151.2 495 201.7 512 256 512c141.4 0 256-114.6 256-256S397.4 0 256 0C185.3 0 121.3 28.7 75 75zm181 53c-13.3 0-24 10.7-24 24l0 104c0 6.4 2.5 12.5 7 17l72 72c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-65-65 0-94.1c0-13.3-10.7-24-24-24z" />
      </svg>
    );
  }
  if (contentType === 'challenge') {
    // flag
    return (
      <svg fill="currentColor" viewBox="0 0 448 512" aria-hidden="true">
        <path d="M32 32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 33.9c14.9-7.5 33.4-8.5 49.3-1.4l14.6 6.5c21.1 9.4 45.7 8 65.6-3.7c30.8-18.1 68.9-20.1 101.5-5.2L384 80l0 192-33.9-13.6c-16.7-6.7-35.8-5.7-51.8 2.7c-33.4 17.5-72.9 18.8-107.4 3.4l-14.6-6.5c-18.8-8.4-40.7-6.9-58.1 4L96 278.1 96 480c0 17.7-14.3 32-32 32s-32-14.3-32-32L32 32z" />
      </svg>
    );
  }
  // church (building)
  return (
    <svg fill="currentColor" viewBox="0 0 640 512" aria-hidden="true">
      <path d="M320 32c17.7 0 32 14.3 32 32l0 64 64 0c17.7 0 32 14.3 32 32l0 64 64 0c35.3 0 64 28.7 64 64l0 192c0 17.7-14.3 32-32 32l-448 0c-17.7 0-32-14.3-32-32l0-192c0-35.3 28.7-64 64-64l64 0 0-64c0-17.7 14.3-32 32-32l64 0 0-64c0-17.7 14.3-32 32-32zm0 96l0 64 0 32-32 0-64 0-32 0 0 32 0 64 0 32-32 0-64 0c-8.8 0-16 7.2-16 16l0 160 96 0 0-96c0-17.7 14.3-32 32-32l128 0c17.7 0 32 14.3 32 32l0 96 96 0 0-160c0-8.8-7.2-16-16-16l-64 0-32 0 0-32 0-64 0-32-32 0-64 0-32 0 0-32 0-64zM272 480l96 0 0-80-96 0 0 80z" />
    </svg>
  );
}

const CTA: Record<FeaturedItem['contentType'], string> = {
  space: 'View this space',
  thread: 'View shared thread',
  recall: 'Review now',
  challenge: 'Start challenge',
  church: 'Open',
};

export default function FeaturedCard({ item, onClose }: { item: FeaturedItem; onClose: () => void }) {
  const navigate = useNavigate();

  const accentGradient = useMemo(() => generateAccentMeshGradient(item.id), [item.id]);

  const accentStyle =
    (item.contentType === 'space' || item.contentType === 'thread') && item.color
      ? { backgroundColor: `var(--color-${item.color})` }
      : { backgroundColor: 'var(--color-light-paper)', backgroundImage: accentGradient ?? undefined };

  return (
    <div className="featured-card" role="region" aria-label="Featured item">
      {/* Info header row */}
      <div className="featured-card__info">
        <div
          className="featured-card__accent"
          style={accentStyle}
          aria-hidden="true"
        >
          {getIconForContentType(item.contentType)}
        </div>
        <div className="featured-card__text">
          <div className="featured-card__title">{item.title}</div>
          {item.description ? (
            <div className="featured-card__description">{item.description}</div>
          ) : null}
        </div>
      </div>

      {/* Full-width action button group — border-radius removed, card clip handles rounding */}
      <div className="featured-card__actions">
        <button
          type="button"
          className="space-btn-lg featured-card__join"
          onClick={() => {
            if (item.contentType === 'space') {
              // For spaces: navigate first, don't dismiss — auto-dismissal fires server-side
              // once the user actually joins (detected by GET /api/featured/items membership check).
              if (item.shareToken) {
                navigate({ to: (`/spaces/join/${item.shareToken}`) as any });
              }
              return;
            }
            if (item.contentType === 'thread') {
              if (item.shareToken) {
                navigate({ to: (`/shared/thread/${item.shareToken}`) as any });
              }
              writeDismissedFeaturedItem(item.id);
              void api.post('/api/featured/dismiss', { featuredItemId: item.id }).catch(() => {});
              onClose();
              return;
            }
            // For all other types: completing the primary action counts as done.
            writeDismissedFeaturedItem(item.id);
            void api.post('/api/featured/dismiss', { featuredItemId: item.id }).catch(() => {});
            onClose();
          }}
        >
          <div className="space-btn-lg__content">
            <span className="space-btn-lg__label">{CTA[item.contentType]}</span>
          </div>
        </button>

        <button
          type="button"
          className="space-btn-lg featured-card__dismiss-btn"
          aria-label="Close featured item"
          onClick={() => {
            writeDismissedFeaturedItem(item.id);
            void api.post('/api/featured/dismiss', { featuredItemId: item.id }).catch(() => {});
            window.dispatchEvent(new CustomEvent('featuredItemDismissed'));
            onClose();
          }}
        >
          <div className="space-btn-lg__content">
            <span className="space-btn-lg__label">Close</span>
          </div>
        </button>
      </div>
    </div>
  );
}
