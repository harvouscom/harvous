import { useMemo, useState } from 'react';
import { useReverification, useUser } from '@clerk/clerk-react';
import type { EmailAddressResource } from '@clerk/types';
import { SettingsSubScreen, SettingsGroup } from '../SettingsShell';
import { ErrorText, Field, getClerkErrorMessage, labelStyle, useRefreshProfileAfterMutation } from './accountShared';

const tagStyle = (color: string): React.CSSProperties => ({
  fontSize: '0.6875rem',
  fontWeight: 600,
  color,
  border: `0.5px solid ${color}`,
  borderRadius: 999,
  padding: '1px 7px',
  whiteSpace: 'nowrap',
});

/** Email addresses: list, add + verify, set primary, remove. Mirrors native profile-details + add/verify views. */
export default function AccountEmails({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const refreshProfile = useRefreshProfileAfterMutation();
  const setPrimary = useReverification((id: string) => user!.update({ primaryEmailAddressId: id }));
  const destroyEmail = useReverification((email: EmailAddressResource) => email.destroy());
  const createEmail = useReverification((value: string) => user!.createEmailAddress({ email: value }));

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add-email flow state.
  const [mode, setMode] = useState<'list' | 'entering' | 'verifying'>('list');
  const [newEmail, setNewEmail] = useState('');
  const [pending, setPending] = useState<EmailAddressResource | null>(null);
  const [code, setCode] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  const sortedEmails = useMemo(() => {
    if (!user) return [];
    return [...user.emailAddresses].sort((a, b) => {
      if (a.id === user.primaryEmailAddressId) return -1;
      if (b.id === user.primaryEmailAddressId) return 1;
      return 0;
    });
  }, [user, user?.emailAddresses, user?.primaryEmailAddressId]);

  if (!user) return null;

  const handleSetPrimary = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await setPrimary(id);
      await refreshProfile(user);
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't set the primary email."));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (email: EmailAddressResource) => {
    setBusyId(email.id);
    setError(null);
    try {
      await destroyEmail(email);
      await refreshProfile(user);
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't remove that email."));
    } finally {
      setBusyId(null);
    }
  };

  const handleStartAdd = async () => {
    setIsWorking(true);
    setError(null);
    try {
      const created = await createEmail(newEmail.trim());
      await created.prepareVerification({ strategy: 'email_code' });
      setPending(created);
      setMode('verifying');
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't add that email."));
    } finally {
      setIsWorking(false);
    }
  };

  const handleVerify = async () => {
    if (!pending) return;
    setIsWorking(true);
    setError(null);
    try {
      await pending.attemptVerification({ code: code.trim() });
      await refreshProfile(user);
      setMode('list');
      setNewEmail('');
      setCode('');
      setPending(null);
    } catch (e) {
      setError(getClerkErrorMessage(e, "That code didn't work. Please try again."));
    } finally {
      setIsWorking(false);
    }
  };

  const handleResend = async () => {
    if (!pending) return;
    setError(null);
    try {
      await pending.prepareVerification({ strategy: 'email_code' });
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't resend the code."));
    }
  };

  // --- Add: enter email ---
  if (mode === 'entering') {
    return (
      <SettingsSubScreen title="Add email" onBack={() => setMode('list')}>
        <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px' }}>
          You'll verify this email with a code before it's added to your account.
        </p>
        <Field label="Email address" type="email" autoComplete="email" value={newEmail} placeholder="you@example.com" onChange={setNewEmail} />
        <ErrorText>{error}</ErrorText>
        <button
          type="button"
          className="proto-settings-btn"
          style={{ marginTop: 8 }}
          disabled={isWorking || !newEmail.trim()}
          onClick={handleStartAdd}
        >
          {isWorking ? 'Sending…' : 'Continue'}
        </button>
      </SettingsSubScreen>
    );
  }

  // --- Add: verify code ---
  if (mode === 'verifying') {
    return (
      <SettingsSubScreen title="Verify email" onBack={() => setMode('list')}>
        <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px' }}>
          Enter the code sent to {pending?.emailAddress}.
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Verification code</label>
          <input
            type="text"
            className="proto-settings-field"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            placeholder="123456"
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <button type="button" className="proto-settings-btn" disabled={isWorking || !code.trim()} onClick={handleVerify}>
          {isWorking ? 'Verifying…' : 'Verify'}
        </button>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary"
          style={{ marginTop: 8 }}
          disabled={isWorking}
          onClick={handleResend}
        >
          Resend code
        </button>
      </SettingsSubScreen>
    );
  }

  // --- List ---
  return (
    <SettingsSubScreen title="Email addresses" onBack={onBack}>
      <SettingsGroup>
        {sortedEmails.map((email, index) => {
          const isPrimary = email.id === user.primaryEmailAddressId;
          const isVerified = email.verification?.status === 'verified';
          const isLast = index === sortedEmails.length - 1;
          return (
            <div
              key={email.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 12px',
                borderBottom: isLast ? 'none' : '0.5px solid var(--pds-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)', minWidth: 0, wordBreak: 'break-all' }}>
                  {email.emailAddress}
                </span>
                {isPrimary ? <span style={tagStyle('var(--pds-text-secondary)')}>Primary</span> : null}
                <span style={tagStyle(isVerified ? 'var(--pds-text-secondary)' : 'var(--pds-warning, #b8730a)')}>
                  {isVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                {!isPrimary && isVerified ? (
                  <button
                    type="button"
                    className="proto-link-btn"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--pds-accent)', fontSize: '0.8125rem' }}
                    disabled={busyId === email.id}
                    onClick={() => handleSetPrimary(email.id)}
                  >
                    Set as primary
                  </button>
                ) : null}
                {!isPrimary ? (
                  <button
                    type="button"
                    style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--pds-destructive)', fontSize: '0.8125rem' }}
                    disabled={busyId === email.id}
                    onClick={() => handleRemove(email)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </SettingsGroup>

      <ErrorText>{error}</ErrorText>

      <button
        type="button"
        className="proto-settings-btn proto-settings-btn--secondary"
        onClick={() => {
          setError(null);
          setMode('entering');
        }}
      >
        Add email address
      </button>
    </SettingsSubScreen>
  );
}
