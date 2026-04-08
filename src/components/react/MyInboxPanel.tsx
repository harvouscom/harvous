import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SquareButton from './SquareButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { generateAccentMeshGradient } from '@/utils/colors';
import Icon from './Icon';
import { FeaturedCardActionsDock } from './FeaturedCardActionsDock';
import SubtleContentMount from './SubtleContentMount';

type FeaturedContentType = 'space' | 'thread' | 'recall' | 'challenge' | 'church';

interface DismissedFeaturedItem {
  id: string;
  contentType: FeaturedContentType;
  title: string;
  description: string | null;
  refId: string | null;
  shareToken: string | null;
  color: string | null;
  dismissedAt: string | null;
}

interface MyInboxPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

const CTA: Record<FeaturedContentType, string> = {
  space: 'View this space',
  thread: 'View shared thread',
  recall: 'Review now',
  challenge: 'Start challenge',
  church: 'Open',
};

function getIconForContentType(contentType: FeaturedContentType) {
  if (contentType === 'space') {
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
    return (
      <svg fill="currentColor" viewBox="0 0 448 512" aria-hidden="true">
        <path d="M32 32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 33.9c14.9-7.5 33.4-8.5 49.3-1.4l14.6 6.5c21.1 9.4 45.7 8 65.6-3.7c30.8-18.1 68.9-20.1 101.5-5.2L384 80l0 192-33.9-13.6c-16.7-6.7-35.8-5.7-51.8 2.7c-33.4 17.5-72.9 18.8-107.4 3.4l-14.6-6.5c-18.8-8.4-40.7-6.9-58.1 4L96 278.1 96 480c0 17.7-14.3 32-32 32s-32-14.3-32-32L32 32z" />
      </svg>
    );
  }
  return (
    <svg fill="currentColor" viewBox="0 0 640 512" aria-hidden="true">
      <path d="M320 32c17.7 0 32 14.3 32 32l0 64 64 0c17.7 0 32 14.3 32 32l0 64 64 0c35.3 0 64 28.7 64 64l0 192c0 17.7-14.3 32-32 32l-448 0c-17.7 0-32-14.3-32-32l0-192c0-35.3 28.7-64 64-64l64 0 0-64c0-17.7 14.3-32 32-32l64 0 0-64c0-17.7 14.3-32 32-32zm0 96l0 64 0 32-32 0-64 0-32 0 0 32 0 64 0 32-32 0-64 0c-8.8 0-16 7.2-16 16l0 160 96 0 0-96c0-17.7 14.3-32 32-32l128 0c17.7 0 32 14.3 32 32l0 96 96 0 0-160c0-8.8-7.2-16-16-16l-64 0-32 0 0-32 0-64 0-32-32 0-64 0-32 0 0-32 0-64zM272 480l96 0 0-80-96 0 0 80z" />
    </svg>
  );
}

function InboxFeaturedCard({
  item,
  onErase,
}: {
  item: DismissedFeaturedItem;
  onErase: (id: string) => void;
}) {
  const accentGradient = useMemo(() => generateAccentMeshGradient(item.id), [item.id]);

  const accentStyle =
    (item.contentType === 'space' || item.contentType === 'thread') && item.color
      ? { backgroundColor: `var(--color-${item.color})` }
      : { backgroundColor: 'var(--color-light-paper)', backgroundImage: accentGradient ?? undefined };

  const handlePrimary = () => {
    if (item.contentType === 'space' && item.shareToken) {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
      safeNavigate(`/spaces/join/${item.shareToken}`, { history: 'push' });
      return;
    }
    if (item.contentType === 'thread' && item.shareToken) {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
      safeNavigate(`/shared/thread/${item.shareToken}`, { history: 'push' });
      return;
    }
    window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  };

  const handleErase = () => {
    void fetch('/api/featured/erase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ featuredItemId: item.id }),
    }).catch(() => {});
    window.dispatchEvent(new CustomEvent('featuredItemErased'));
    onErase(item.id);
  };

  return (
    <div className="featured-card-shell">
      <div className="featured-card" role="region" aria-label={item.title}>
        <div className="featured-card__info">
          <div className="featured-card__accent" style={accentStyle} aria-hidden="true">
            {getIconForContentType(item.contentType)}
          </div>
          <div className="featured-card__text">
            <div className="featured-card__title">{item.title}</div>
            {item.description ? <div className="featured-card__description">{item.description}</div> : null}
          </div>
        </div>
      </div>

      <FeaturedCardActionsDock
        animateEntrance={false}
        trailing={
          <button
            type="button"
            className="action-strip__item featured-card__strip-item--muted"
            aria-label="Erase from inbox"
            onClick={handleErase}
          >
            <span className="action-strip__label">Erase</span>
          </button>
        }
      >
        <button type="button" className="action-strip__item featured-card__strip-item--primary" onClick={handlePrimary}>
          <span className="action-strip__label">{CTA[item.contentType]}</span>
        </button>
      </FeaturedCardActionsDock>
    </div>
  );
}

export default function MyInboxPanel({ onClose, inBottomSheet = false }: MyInboxPanelProps) {
  const [items, setItems] = useState<DismissedFeaturedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (onClose) onClose();
    else window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  };

  const fetchItems = useCallback(async (backgroundRefetch = false) => {
    if (!backgroundRefetch) setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/featured/dismissed', { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to load inbox');
      setItems(Array.isArray(data) ? (data as DismissedFeaturedItem[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inbox');
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(false);
  }, [fetchItems]);

  useEffect(() => {
    const handlePanelOpened = (event: CustomEvent) => {
      if (event.detail?.panelName === 'myInbox') {
        fetchItems(true);
      }
    };
    window.addEventListener('openProfilePanel', handlePanelOpened as EventListener);
    return () => window.removeEventListener('openProfilePanel', handlePanelOpened as EventListener);
  }, [fetchItems]);

  const handleErase = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const isEmpty = !isLoading && !error && items.length === 0;

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <div className="flex-fill flex-stack" style={{ position: 'relative', gap: 0 }}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>My Inbox</p>
            </div>
          </div>

          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              {isLoading ? (
                <div className="w-full p-8 text-center">
                  <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px' }}>
                    Loading…
                  </p>
                </div>
              ) : (
                <SubtleContentMount>
                  {error ? (
                    <div
                      className="w-full p-4 rounded-xl mb-3"
                      style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-pebble-grey)' }}
                    >
                      <p className="text-sm font-sans" style={{ color: 'var(--color-deep-grey)' }}>
                        {error}
                      </p>
                    </div>
                  ) : null}
                  {isEmpty ? (
                    <div className="w-full p-8 text-center">
                      <p className="font-sans" style={{ color: 'var(--color-pebble-grey)', fontSize: '16px', textWrap: 'balance' }}>
                        Your inbox is empty
                      </p>
                    </div>
                  ) : null}
                  {!error && items.length > 0 ? (
                    <div className="flex-stack w-full" style={{ gap: '0.75rem' }}>
                      {items.map((it) => (
                        <InboxFeaturedCard key={it.id} item={it} onErase={handleErase} />
                      ))}
                    </div>
                  ) : null}
                </SubtleContentMount>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
      </div>
    </div>
  );
}
