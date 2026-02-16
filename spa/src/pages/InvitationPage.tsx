import { useEffect, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../lib/api';
import { idToUrl } from '../../../src/utils/url-helpers';

interface InvitationInfo {
  spaceTitle: string;
  spaceBackgroundGradient?: string;
  inviterDisplayName: string;
  role: string;
  isAlreadyMember: boolean;
  isExpired: boolean;
}

export default function InvitationPage() {
  const { token } = useParams({ from: '/invitations/$token' });
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<InvitationInfo>(`/api/invitations/${token}`)
      .then(setInvitation)
      .catch(() => setError('This invitation is invalid or has expired.'))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!isSignedIn) {
      sessionStorage.setItem('pendingRedirect', `/invitations/${token}`);
      navigate({ to: '/sign-in' });
      return;
    }
    setIsAccepting(true);
    try {
      const result = await api.post<{ success: boolean; space: { id: string }; redirectUrl: string }>(
        `/api/invitations/${token}/accept`,
        {}
      );
      if (result.success) {
        navigate({ to: idToUrl(result.space.id) as any });
      }
    } catch {
      setError('Failed to accept invitation. It may have already been used or expired.');
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) return <div className="page-loading" />;

  if (error || !invitation) {
    return (
      <div className="invitation-page">
        <div className="invitation-error">{error ?? 'Invitation not found.'}</div>
      </div>
    );
  }

  if (invitation.isExpired) {
    return (
      <div className="invitation-page">
        <div className="invitation-error">This invitation has expired.</div>
      </div>
    );
  }

  if (invitation.isAlreadyMember) {
    return (
      <div className="invitation-page">
        <div className="invitation-card">
          <h1 className="invitation-title">{invitation.spaceTitle}</h1>
          <p className="invitation-meta">You're already a member of this space.</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate({ to: '/dashboard' })}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="invitation-page">
      <div className="invitation-card">
        <div
          className="invitation-gradient"
          style={{ background: invitation.spaceBackgroundGradient ?? 'var(--color-surface-2)' }}
        />
        <div className="invitation-content">
          <p className="invitation-from">{invitation.inviterDisplayName} invited you to join</p>
          <h1 className="invitation-title">{invitation.spaceTitle}</h1>
          <button
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={isAccepting}
          >
            {isAccepting ? 'Accepting…' : 'Accept Invitation'}
          </button>
        </div>
      </div>
    </div>
  );
}
