import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import CondensedNoteItem from '@/components/react/CondensedNoteItem';
import { api } from '../../lib/api';
import { useJoinSpace } from '../../hooks/mutations/useJoinSpace';
import { navigationQueryKeyPrefix } from '../../hooks/queries/useNavigation';
import { idToUrl } from '@/utils/url-helpers';
import { formatBadgeCount } from '@/utils/badge-count';
import { PublicTopBar, CircleQuestionIcon } from './public-shared';

interface SpacePreview {
  id: string;
  title: string;
  color?: string;
  backgroundGradient?: string;
  ownerDisplayName: string;
  isHarvousOwned: boolean;
  memberCount: number;
  isAlreadyMember: boolean;
  notes?: Array<{ id: string; title: string; noteType: string; scriptureTranslation?: string; version?: string }>;
  threads?: Array<{ id: string; title: string; color: string; noteCount: number }>;
}

interface JoinPreviewResponse {
  space: { id: string; title: string; color?: string; backgroundGradient?: string; description?: string };
  owner: { displayName: string; isHarvousOwned?: boolean } | null;
  memberCount: number;
  threadPreviews: Array<{ id: string; title: string; color: string; noteCount: number }>;
  notePreviews: Array<{ id: string; title: string; noteType: string; createdAt?: string }>;
  isAlreadyMember: boolean;
}

export default function PublicJoinSpacePage() {
  const { token } = useParams({ from: '/spaces/join/$token' });
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [space, setSpace] = useState<SpacePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const joinSpaceMutation = useJoinSpace();
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<JoinPreviewResponse>(`/api/spaces/join-preview/${token}`)
      .then((res) => {
        setSpace({
          ...res.space,
          ownerDisplayName: res.owner?.displayName ?? 'Anonymous',
          isHarvousOwned: res.owner?.isHarvousOwned ?? false,
          memberCount: res.memberCount,
          isAlreadyMember: res.isAlreadyMember,
          notes: res.notePreviews,
          threads: res.threadPreviews,
        });
      })
      .catch(() => setError('invalid'))
      .finally(() => setIsLoading(false));
  }, [token]);

  function showToast(message: string, type: 'success' | 'error', duration = 5000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => setToastVisible(false), duration);
    }
  }

  const handleJoin = async () => {
    if (!isSignedIn) {
      try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
      navigate({ to: `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}` as any });
      return;
    }
    try {
      const result = await joinSpaceMutation.mutateAsync(token);
      if (result.success) {
        try { sessionStorage.setItem('harvous_show_pwa_prompt_from_join', '1'); } catch (_) {}
        window.dispatchEvent(new CustomEvent('spaceCreated', {
          detail: {
            space: {
              id: result.spaceId,
              title: space?.title ?? '',
              backgroundGradient: space?.backgroundGradient ?? 'var(--color-paper)',
              isShared: true,
            },
          },
        }));
        await queryClient.refetchQueries({ queryKey: navigationQueryKeyPrefix });
        navigate({ to: (result.redirectUrl || idToUrl(result.spaceId)) as any });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to join space. Please try again.', 'error');
    }
  };

  const spaceColor = space?.color || 'paper';
  const colorVar = `var(--color-${spaceColor})`;
  const spaceUrl = space ? idToUrl(space.id) : '';

  return (
    <>
      {space && <title>{`${space.title || 'Join Space'} | Harvous`}</title>}
      <div className="public-page">
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className="public-content">
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !space) ? (
              <div className="public-error">
                <div className="public-error__icon"><CircleQuestionIcon /></div>
                <h1 className="public-error__title">This space isn't available</h1>
                <p className="public-error__message">
                  Hmm, we can't find this space. The link might have expired or the owner made it private.
                </p>
                <a href="https://harvous.com" className="public-error__link">Learn more about Harvous</a>
              </div>
            ) : (
              <SubtleContentMount>
                <>
                  <p className="public-creator">
                    {space.isHarvousOwned
                      ? "You're invited to join this space on Harvous"
                      : `${space.ownerDisplayName || 'A Harvous User'} invited you to join this space on Harvous`}
                  </p>

                  <div className="public-card">
                    <div className="public-card__color-stripe" style={{ background: colorVar }} />
                    <div className="public-card__header">
                      <h1 className="public-card__title">{space.title}</h1>
                    </div>

                    <div className="public-card__scroll">
                      <p className="public-people-count">
                        {space.memberCount} {space.memberCount === 1 ? 'person' : 'people'} in this space
                      </p>

                      {(!space.threads?.length && !space.notes?.length) ? (
                        <div className="public-card__empty">No notes yet. Join to get started.</div>
                      ) : (
                        <>
                          {space.threads?.map((thread, i) => (
                            <div
                              key={thread.id}
                              className="public-thread-row card-enter"
                              style={{ animationDelay: `${100 + i * 40}ms` }}
                            >
                              <div className="public-thread-row__accent" style={{ background: `var(--color-${thread.color || 'blue'})` }} />
                              <span className="public-thread-row__title">{thread.title}</span>
                              {thread.noteCount > 0 && (
                                <span className="public-thread-row__badge">{formatBadgeCount(thread.noteCount)}</span>
                              )}
                            </div>
                          ))}
                          {space.notes?.map((note, i) => (
                            <div
                              key={note.id}
                              className="public-card__list-item card-enter"
                              style={{ animationDelay: `${100 + ((space.threads?.length || 0) + i) * 40}ms` }}
                            >
                              <CondensedNoteItem
                                title={note.title || 'Untitled'}
                                noteType={note.noteType as any || 'default'}
                                href="#"
                                noteId={note.id}
                                scriptureTranslation={note.scriptureTranslation ?? note.version ?? undefined}
                              />
                            </div>
                          ))}
                        </>
                      )}
                    </div>

                    <div className="public-card__cta">
                      <div className={`public-toast public-toast--${toastType}${toastVisible ? ' public-toast--visible' : ''}`}>
                        {toastMessage}
                      </div>
                      {!isSignedIn ? (
                        <a
                          href={`/sign-in?redirect_url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
                          className="public-cta-btn"
                          onClick={() => {
                            try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
                          }}
                        >
                          Join this space on Harvous
                        </a>
                      ) : space.isAlreadyMember ? (
                        <button className="public-cta-btn" onClick={() => navigate({ to: spaceUrl as any })}>
                          Go to Space
                        </button>
                      ) : (
                        <button
                          id="join-space-btn"
                          className="public-cta-btn"
                          onClick={handleJoin}
                          disabled={joinSpaceMutation.isPending}
                        >
                          {joinSpaceMutation.isPending ? 'Joining…' : 'Join this space on Harvous'}
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="public-footer">
                    Harvous is a notes app for Bible study.{' '}
                    <a href="https://harvous.com" target="_blank" rel="noopener noreferrer">harvous.com</a>
                  </p>
                </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
