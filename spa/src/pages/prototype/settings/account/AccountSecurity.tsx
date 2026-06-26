import { useCallback, useEffect, useState } from 'react';
import { useReverification, useSession, useUser } from '@clerk/clerk-react';
import type { SessionWithActivitiesResource } from '@clerk/types';
import { SettingsGroup, SettingsSubScreen } from '../SettingsShell';
import { ErrorText, getClerkErrorMessage } from './accountShared';

function deviceLabel(s: SessionWithActivitiesResource): string {
  const a = s.latestActivity;
  const browser = [a?.browserName, a?.browserVersion].filter(Boolean).join(' ');
  const device = a?.isMobile ? 'Mobile' : a?.deviceType || 'Desktop';
  return [device, browser].filter(Boolean).join(' · ') || 'Unknown device';
}

function locationLabel(s: SessionWithActivitiesResource): string | null {
  const a = s.latestActivity;
  const loc = [a?.city, a?.country].filter(Boolean).join(', ');
  return [loc, a?.ipAddress].filter(Boolean).join(' · ') || null;
}

/** Active devices + delete account. Mirrors native HarvousMacUserProfileSecurityView. */
export default function AccountSecurity({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const { session } = useSession();
  const revokeSession = useReverification((s: SessionWithActivitiesResource) => s.revoke());
  const deleteAccount = useReverification(() => user!.delete());

  const [sessions, setSessions] = useState<SessionWithActivitiesResource[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    try {
      setSessions(await user.getSessions());
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't load your devices."));
    }
  }, [user]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  if (!user) return null;

  const handleRevoke = async (s: SessionWithActivitiesResource) => {
    setBusyId(s.id);
    setError(null);
    try {
      await revokeSession(s);
      await loadSessions();
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't sign out that device."));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteAccount();
      // Clerk signs the user out on delete; the signed-in route guard redirects.
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't delete your account."));
      setIsDeleting(false);
    }
  };

  return (
    <SettingsSubScreen title="Security" onBack={onBack}>
      <h2 className="pds-list-title" style={{ color: 'var(--pds-text-primary)', margin: '0 0 8px' }}>
        Active devices
      </h2>
      <SettingsGroup>
        {sessions.length === 0 ? (
          <div className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', padding: '12px' }}>
            No other active devices.
          </div>
        ) : (
          sessions.map((s, index) => {
            const isCurrent = s.id === session?.id;
            const loc = locationLabel(s);
            return (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '12px',
                  borderBottom: index === sessions.length - 1 ? 'none' : '0.5px solid var(--pds-border)',
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="pds-list-title" style={{ display: 'block', color: 'var(--pds-text-primary)' }}>
                    {deviceLabel(s)}
                    {isCurrent ? (
                      <span className="pds-caption" style={{ color: 'var(--pds-text-secondary)', marginLeft: 6 }}>
                        (This device)
                      </span>
                    ) : null}
                  </span>
                  {loc ? (
                    <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
                      {loc}
                    </span>
                  ) : null}
                </span>
                {!isCurrent ? (
                  <button
                    type="button"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--pds-destructive)', fontSize: '0.8125rem', flexShrink: 0 }}
                    disabled={busyId === s.id}
                    onClick={() => handleRevoke(s)}
                  >
                    Sign out
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </SettingsGroup>

      {user.deleteSelfEnabled ? (
        <>
          <h2 className="pds-list-title" style={{ color: 'var(--pds-text-primary)', margin: '24px 0 8px' }}>
            Delete account
          </h2>
          <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 12px' }}>
            Permanently deletes your account and sign-in. Your Harvous study data must be removed separately from My Data.
          </p>
          <ErrorText>{error}</ErrorText>
          {confirmDelete ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="pds-subheadline" style={{ color: 'var(--pds-text-primary)', margin: 0 }}>
                This cannot be undone. Delete your account?
              </p>
              <button type="button" className="proto-settings-btn proto-settings-btn--destructive" disabled={isDeleting} onClick={handleDelete}>
                {isDeleting ? 'Deleting…' : 'Delete account'}
              </button>
              <button
                type="button"
                className="proto-settings-btn proto-settings-btn--secondary"
                disabled={isDeleting}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              style={{ color: 'var(--pds-destructive)' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete account…
            </button>
          )}
        </>
      ) : (
        <ErrorText>{error}</ErrorText>
      )}
    </SettingsSubScreen>
  );
}
