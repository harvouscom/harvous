import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { FeaturedSpace } from '../hooks/queries/useFeaturedSpace';

function dismissKey(spaceId: string) {
  return `dismissed_featured_${spaceId}`;
}

function readDismissed(spaceId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(spaceId)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(spaceId: string) {
  try {
    localStorage.setItem(dismissKey(spaceId), '1');
  } catch {
    /* ignore */
  }
}

export default function FeaturedSpaceCard({ space }: { space: FeaturedSpace }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(space.id));
  }, [space.id]);

  const headerBg = useMemo(() => {
    const c = space.color || 'paper';
    return `var(--color-${c})`;
  }, [space.color]);

  if (dismissed) return null;

  return (
    <div className="featured-space-card" role="region" aria-label="Featured study">
      <div className="featured-space-card__border" />

      <div className="featured-space-card__header" style={{ backgroundColor: headerBg }}>
        <div className="featured-space-card__header-inner">
          <div className="featured-space-card__label">Featured</div>
          <button
            type="button"
            className="featured-space-card__dismiss"
            aria-label="Dismiss featured study"
            onClick={() => {
              writeDismissed(space.id);
              setDismissed(true);
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div className="featured-space-card__content">
        <div className="featured-space-card__title">{space.title}</div>
        {space.description ? (
          <div className="featured-space-card__description">{space.description}</div>
        ) : null}

        <div className="featured-space-card__actions">
          <button
            type="button"
            className="btn btn--primary btn--lg featured-space-card__cta"
            onClick={() => navigate({ to: (`/spaces/join/${space.shareToken}`) as any })}
          >
            <div className="btn__content">
              <span>Join this study</span>
            </div>
            <div className="btn__shadow-overlay" />
          </button>
        </div>
      </div>
    </div>
  );
}

