import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { api } from '../../lib/api';
import { useJoinSpace } from '../../hooks/mutations/useJoinSpace';
import { navigationQueryKeyPrefix } from '../../hooks/queries/useNavigation';
import { PublicTopBar, PublicErrorState } from './public-shared';
import PublicJoinSpaceLetter, { type PublicJoinSpaceLetterSpace } from './PublicJoinSpaceLetter';
import PublicJoinSpaceHero from './PublicJoinSpaceHero';
import { writePersistedSidebarNav } from '../prototype/proto-sidebar-nav-store';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';

interface JoinPreviewResponse {
  space: {
    id: string;
    title: string;
    color?: string;
    backgroundGradient?: string;
    description?: string;
    coverBgLight?: import('@/utils/space-cover').SpaceCoverBg;
    coverBgDark?: import('@/utils/space-cover').SpaceCoverBg;
  };
  owner: {
    displayName: string;
    isHarvousOwned?: boolean;
    profileImageUrl?: string | null;
    accentLight?: string | null;
    accentDark?: string | null;
  } | null;
  memberCount: number;
  memberPreviews?: Array<{ initial: string; accentLight?: string | null; accentDark?: string | null }>;
  threadPreviews: Array<{ id: string; title: string; color: string; noteCount: number }>;
  notePreviews: Array<{ id: string; title: string; noteType: string; createdAt?: string }>;
  isAlreadyMember: boolean;
}

export default function PublicJoinSpacePage() {
  const { token } = useParams({ from: '/spaces/join/$token' });
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [space, setSpace] = useState<PublicJoinSpaceLetterSpace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const joinSpaceMutation = useJoinSpace();
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('error');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<JoinPreviewResponse>(`/api/spaces/invite-preview/${token}`)
      .then((res) => {
        setSpace({
          id: res.space.id,
          title: res.space.title,
          color: res.space.color,
          backgroundGradient: res.space.backgroundGradient,
          description: res.space.description,
          cover: {
            light: res.space.coverBgLight ?? null,
            dark: res.space.coverBgDark ?? null,
          },
          ownerDisplayName: res.owner?.displayName ?? 'Anonymous',
          ownerProfileImageUrl: res.owner?.profileImageUrl ?? null,
          ownerAccentLight: res.owner?.accentLight ?? null,
          ownerAccentDark: res.owner?.accentDark ?? null,
          isHarvousOwned: res.owner?.isHarvousOwned ?? false,
          memberCount: res.memberCount,
          memberPreviews: res.memberPreviews ?? [],
          isAlreadyMember: res.isAlreadyMember,
          notes: res.notePreviews?.slice(0, 3),
          threads: res.threadPreviews?.slice(0, 3),
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
              title: space?.title ?? result.spaceName ?? '',
              backgroundGradient: space?.backgroundGradient ?? 'var(--color-paper)',
              isShared: true,
            },
          },
        }));
        const normalizedId = result.spaceId.startsWith('space_') ? result.spaceId : `space_${result.spaceId}`;
        try {
          sessionStorage.setItem(
            'harvous_just_joined_space',
            JSON.stringify({ id: normalizedId, title: space?.title ?? result.spaceName ?? '' }),
          );
        } catch { /* ignore */ }
        writePersistedSidebarNav({ activeSpaceId: normalizedId, layer: 'space', clearFolderDrill: true, clearThreadDrill: true, clearScriptureDrill: true });
        await queryClient.refetchQueries({ queryKey: navigationQueryKeyPrefix });
        navigate({ to: prototypeHomeRouteTo() as any });
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to join space. Please try again.', 'error');
    }
  };

  const signInHref =
    typeof window !== 'undefined'
      ? `/sign-in?redirect_url=${encodeURIComponent(window.location.href)}`
      : '/sign-in';

  return (
    <>
      {space && <title>{`${space.title || 'Join Space'} | Harvous`}</title>}
      <div className="public-page">
        <PublicTopBar isSignedIn={!!isSignedIn} />

        <div className="public-body">
          <div className="public-content public-content--upgrade">
            <PublicJoinSpaceHero space={space} />
            {isLoading ? (
              <div className="page-loading" />
            ) : (error || !space) ? (
              <PublicErrorState
                title="This space isn't available"
                message="Hmm, we can't find this space. The link might have expired or the owner made it private."
              />
            ) : (
              <SubtleContentMount variant="fade">
                <>
                  <PublicJoinSpaceLetter
                    space={space}
                    isSignedIn={!!isSignedIn}
                    isJoinPending={joinSpaceMutation.isPending}
                    toastMessage={toastMessage}
                    toastType={toastType}
                    toastVisible={toastVisible}
                    signInHref={signInHref}
                    onSignInClick={() => {
                      try { sessionStorage.setItem('harvous_pending_redirect', window.location.href); } catch { /* ignore */ }
                    }}
                    onJoin={() => void handleJoin()}
                    onGoToSpace={() => {
                      const normalizedId = space.id.startsWith('space_') ? space.id : `space_${space.id}`;
                      writePersistedSidebarNav({ activeSpaceId: normalizedId, layer: 'space', clearFolderDrill: true, clearThreadDrill: true, clearScriptureDrill: true });
                      navigate({ to: prototypeHomeRouteTo() as any });
                    }}
                  />
                  <div className="public-footer public-footer--rich">
                    <span className="public-footer__tag">
                      Harvous is a notes app for Bible study.{' '}
                      <a href="https://harvous.com" target="_blank" rel="noopener noreferrer" className="public-footer__cta">
                        harvous.com
                      </a>
                    </span>
                  </div>
                </>
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
