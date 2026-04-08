import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { featuredItemsQueryKey, type FeaturedItem, type VotdMetadata } from '../hooks/queries/useFeaturedItems';
import { navigationQueryKeyPrefix } from '../hooks/queries/useNavigation';
import { useProfile } from '../hooks/queries/useProfile';
import { getCachedProfileData } from '@/utils/profile-cache';
import { generateAccentMeshGradient, getThreadIconOnAccentCSS } from '../../../src/utils/colors';
import {
  stripLeadingVerseNumberFromPlainText,
  stripRedundantEdgeQuotesForVotdCard,
  stripHtmlPreservingBreaksForVotd,
} from '@/utils/verse-plain-display';
import Icon from '@/components/react/Icon';
import { FeaturedCardActionsDock } from '@/components/react/FeaturedCardActionsDock';

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
  if (contentType === 'votd') {
    return <Icon name="scroll" size={20} />;
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
  votd: 'Add to my Harvous',
};

function votdPlainFromHtml(html: string, meta: VotdMetadata | null | undefined): string {
  const plain = stripHtmlPreservingBreaksForVotd(html);
  const withoutVerseNum = stripLeadingVerseNumberFromPlainText(
    plain,
    meta?.verse ?? undefined,
    meta?.verseEnd ?? undefined,
  );
  return stripRedundantEdgeQuotesForVotdCard(withoutVerseNum);
}

// Dismisses a VOTD card (marks complete server-side + fires local dismiss)
function dismissVotd(
  item: FeaturedItem,
  onClose: () => void,
  options?: { votdEngagement?: 'create_note'; onServerAck?: () => void },
) {
  writeDismissedFeaturedItem(item.id);
  const payload: { featuredItemId: string; votdEngagement?: 'create_note' } = { featuredItemId: item.id };
  if (options?.votdEngagement) payload.votdEngagement = options.votdEngagement;
  void api
    .post('/api/featured/dismiss', payload)
    .then(() => {
      options?.onServerAck?.();
    })
    .catch(() => {});
  window.dispatchEvent(new CustomEvent('featuredItemDismissed'));
  onClose();
}

// Builds the scripture pill HTML for pre-populating the note editor
function buildScripturePillHtml(metadata: VotdMetadata, translationForPill: string): string {
  const ref = metadata.reference;
  const translation = translationForPill || metadata.translation || 'NET';
  // NBSP after pill so a visible gap remains before typed text (normal space can collapse at block end)
  return `<p><span data-scripture-reference="${ref}" data-note-id="pending" data-scripture-translation="${translation}" class="scripture-pill scripture-pill-clickable">${ref}</span>\u00A0</p>`;
}

function VotdCard({ item, onClose }: { item: FeaturedItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const metadata = item.metadata;
  const catalogTranslation = metadata?.translation ?? 'NET';
  const catalogVersePlain = metadata?.verseText
    ? votdPlainFromHtml(metadata.verseText, metadata)
    : stripRedundantEdgeQuotesForVotdCard(item.description ?? '');

  const [displayVerse, setDisplayVerse] = useState(catalogVersePlain);
  const [displayTranslation, setDisplayTranslation] = useState(catalogTranslation);

  useEffect(() => {
    const catalogT = metadata?.translation ?? 'NET';
    const catalogV = metadata?.verseText
      ? votdPlainFromHtml(metadata.verseText, metadata)
      : stripRedundantEdgeQuotesForVotdCard(item.description ?? '');
    // Prefer sessionStorage profile-cache first: DefaultTranslationPanel updates it on save but does not
    // update React Query until refetch; useProfile can be stale for staleTime (5m) with wrong translation.
    const fromSession = getCachedProfileData()?.defaultTranslation?.trim();
    const fromProfile = profile?.defaultTranslation?.trim();
    const effective = (fromSession || fromProfile || catalogT);

    if (!metadata?.reference || effective === catalogT) {
      setDisplayVerse(catalogV);
      setDisplayTranslation(catalogT);
      return;
    }

    let cancelled = false;
    void api
      .post<{ text?: string }>('/api/scripture/fetch-verse', {
        reference: metadata.reference,
        translation: effective,
      })
      .then((res) => {
        if (cancelled) return;
        if (res.text && res.text.trim()) {
          setDisplayVerse(votdPlainFromHtml(res.text, metadata));
          setDisplayTranslation(effective);
        } else {
          setDisplayVerse(catalogV);
          setDisplayTranslation(catalogT);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisplayVerse(catalogV);
          setDisplayTranslation(catalogT);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    item.description,
    item.id,
    metadata?.reference,
    metadata?.translation,
    metadata?.verseText,
    profile?.defaultTranslation,
  ]);

  const handleQuickAdd = async () => {
    if (isAdding) return;
    setIsAdding(true);
    try {
      await api.post<{ success: boolean; noteId?: string }>('/api/featured/votd/quick-add', {
        featuredItemId: item.id,
      });
      setAdded(true);
      writeDismissedFeaturedItem(item.id);
      void queryClient.invalidateQueries({ queryKey: ['dashboard', 'content'] });
      void queryClient.invalidateQueries({ queryKey: featuredItemsQueryKey });
      void queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
      void queryClient.invalidateQueries({ queryKey: ['thread', 'thread_unorganized'] });
      void queryClient.invalidateQueries({ queryKey: ['xp'] });
      window.dispatchEvent(new CustomEvent('featuredItemDismissed'));
      setTimeout(() => onClose(), 900);
    } catch {
      setIsAdding(false);
    }
  };

  const handleCreateNote = () => {
    if (!metadata) return;
    const pillHtml = buildScripturePillHtml(metadata, displayTranslation);
    // Pre-populate the new note panel with the scripture pill
    try {
      localStorage.removeItem('newNoteTitle');
      localStorage.setItem('newNoteContent', pillHtml);
      localStorage.removeItem('newNoteType');
    } catch {}
    dismissVotd(item, onClose, {
      votdEngagement: 'create_note',
      onServerAck: () => {
        void queryClient.invalidateQueries({ queryKey: ['xp'] });
      },
    });
    window.dispatchEvent(new CustomEvent('openNewNotePanel'));
  };

  return (
    <div className="featured-card-shell">
      <div className="featured-card featured-card--votd" role="region" aria-label="Verse of the Day">
        {displayVerse ? (
          <div className="featured-card__verse-row">
            <div className="featured-card__votd-verse-icon" aria-hidden="true">
              {getIconForContentType('votd')}
            </div>
            <div className="featured-card__verse-text">
              &ldquo;{displayVerse}&rdquo;
              {metadata?.reference ? (
                <>
                  {' '}
                  <span
                    className="scripture-pill"
                    data-scripture-reference={metadata.reference}
                    data-scripture-translation={displayTranslation}
                  >
                    {metadata.reference}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {!displayVerse ? (
          <div className="featured-card__info">
            <div
              className="featured-card__accent"
              style={{ backgroundColor: 'var(--color-light-paper)', backgroundImage: 'none' }}
              aria-hidden="true"
            >
              {getIconForContentType('votd')}
            </div>
            <div className="featured-card__text">
              <div className="featured-card__title">{item.title}</div>
              {metadata?.reference ? (
                <div className="featured-card__description">
                  {metadata.reference} · {displayTranslation}
                </div>
              ) : item.description ? (
                <div className="featured-card__description">{item.description}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <FeaturedCardActionsDock
        trailing={
          <button
            type="button"
            className="action-strip__item featured-card__strip-item--muted"
            aria-label="Dismiss verse of the day"
            onClick={() => dismissVotd(item, onClose)}
          >
            <span className="action-strip__label">Close</span>
          </button>
        }
      >
        <button
          type="button"
          className="action-strip__item featured-card__strip-item--primary"
          disabled={isAdding}
          onClick={handleQuickAdd}
        >
          <span className="action-strip__label">{added ? 'Added!' : isAdding ? 'Adding…' : 'Add to my Harvous'}</span>
        </button>
        <button type="button" className="action-strip__item" onClick={handleCreateNote}>
          <span className="action-strip__label">Create note</span>
        </button>
      </FeaturedCardActionsDock>
    </div>
  );
}

export default function FeaturedCard({ item, onClose }: { item: FeaturedItem; onClose: () => void }) {
  if (item.contentType === 'votd') {
    return <VotdCard item={item} onClose={onClose} />;
  }

  const navigate = useNavigate();

  const accentGradient = useMemo(() => generateAccentMeshGradient(item.id), [item.id]);

  const accentSurfaceStyle = useMemo(
    () => ({
      ...((item.contentType === 'space' || item.contentType === 'thread') && item.color
        ? { backgroundColor: `var(--color-${item.color})` }
        : { backgroundColor: 'var(--color-light-paper)', backgroundImage: accentGradient ?? undefined }),
      ['--thread-accent-icon-color' as string]: getThreadIconOnAccentCSS(item.color ?? undefined),
    }),
    [item.contentType, item.color, accentGradient],
  );

  const handlePrimary = () => {
    if (item.contentType === 'space') {
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
    writeDismissedFeaturedItem(item.id);
    void api.post('/api/featured/dismiss', { featuredItemId: item.id }).catch(() => {});
    onClose();
  };

  const handleClose = () => {
    writeDismissedFeaturedItem(item.id);
    void api.post('/api/featured/dismiss', { featuredItemId: item.id }).catch(() => {});
    window.dispatchEvent(new CustomEvent('featuredItemDismissed'));
    onClose();
  };

  return (
    <div className="featured-card-shell">
      <div className="featured-card" role="region" aria-label="Featured item">
        <div className="featured-card__info">
          <div className="featured-card__accent" style={accentSurfaceStyle} aria-hidden="true">
            {getIconForContentType(item.contentType)}
          </div>
          <div className="featured-card__text">
            <div className="featured-card__title">{item.title}</div>
            {item.description ? <div className="featured-card__description">{item.description}</div> : null}
          </div>
        </div>
      </div>

      <FeaturedCardActionsDock
        trailing={
          <button
            type="button"
            className="action-strip__item featured-card__strip-item--muted"
            aria-label="Close featured item"
            onClick={handleClose}
          >
            <span className="action-strip__label">Close</span>
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
