import { useEffect, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../lib/api';

interface SpacePreview {
  id: string;
  title: string;
  backgroundGradient?: string;
  ownerDisplayName: string;
  ownerColor?: string;
  memberCount: number;
  noteCount: number;
  isAlreadyMember: boolean;
}

export default function JoinSpacePage() {
  const { token } = useParams({ from: '/spaces/join/$token' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [space, setSpace] = useState<SpacePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SpacePreview>(`/api/spaces/join-preview/${token}`)
      .then(setSpace)
      .catch(() => setError('This invite link is invalid or has expired.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleJoin = async () => {
    if (!isSignedIn) {
      sessionStorage.setItem('pendingAction', JSON.stringify({ type: 'joinSpace', token }));
      navigate({ to: '/sign-in' });
      return;
    }
    setIsJoining(true);
    try {
      const result = await api.post<{ success: boolean; spaceId: string; redirectUrl: string }>(
        `/api/spaces/join/${token}`,
        {}
      );
      if (result.success) {
        navigate({ to: `/app/s/${result.spaceId}` });
      }
    } catch {
      setError('Failed to join space. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading) return <div className="page-loading" />;

  if (error || !space) {
    return (
      <div className="join-space-page">
        <div className="join-space-error">{error ?? 'Space not found.'}</div>
      </div>
    );
  }

  return (
    <div className="join-space-page">
      <div className="join-space-card">
        <div
          className="join-space-gradient"
          style={{ background: space.backgroundGradient ?? 'var(--color-surface-2)' }}
        />
        <div className="join-space-content">
          <h1 className="join-space-title">{space.title}</h1>
          <p className="join-space-meta">
            By {space.ownerDisplayName} · {space.memberCount} member{space.memberCount !== 1 ? 's' : ''}
          </p>
          {space.isAlreadyMember ? (
            <button
              className="btn btn-primary"
              onClick={() => navigate({ to: `/app/s/${space.id}` })}
            >
              Open Space
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleJoin}
              disabled={isJoining}
            >
              {isJoining ? 'Joining…' : 'Join Space'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
