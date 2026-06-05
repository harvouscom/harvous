import { useState } from 'react';
import { useReverification, useUser } from '@clerk/clerk-react';
import { SettingsSubScreen } from '../SettingsShell';
import { ErrorText, Field, getClerkErrorMessage } from './accountShared';

/** Change (or set) password. Mirrors native HarvousMacUserProfileChangePasswordView. */
export default function AccountChangePassword({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const isAdding = user?.passwordEnabled === false;
  const submitPassword = useReverification(
    (params: { currentPassword?: string; newPassword: string; signOutOfOtherSessions: boolean }) =>
      user!.updatePassword(params),
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [didSave, setDidSave] = useState(false);

  if (!user) return null;

  const trimmedNew = newPassword.trim();
  const canSave =
    trimmedNew.length >= 8 && trimmedNew === confirmPassword.trim() && (isAdding || currentPassword.length > 0);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await submitPassword({
        currentPassword: isAdding ? undefined : currentPassword,
        newPassword: trimmedNew,
        signOutOfOtherSessions: signOutOthers,
      });
      setDidSave(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't update your password."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsSubScreen title={isAdding ? 'Set password' : 'Change password'} onBack={onBack}>
      {!isAdding ? (
        <Field
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
      ) : null}
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        value={newPassword}
        onChange={setNewPassword}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={setConfirmPassword}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px', cursor: 'pointer' }}>
        <input type="checkbox" checked={signOutOthers} onChange={(e) => setSignOutOthers(e.target.checked)} />
        <span className="pds-subheadline" style={{ color: 'var(--pds-text-primary)' }}>
          Sign out of all other devices
        </span>
      </label>
      <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px' }}>
        Password must be at least 8 characters.
      </p>

      <ErrorText>{error}</ErrorText>

      <button type="button" className="proto-settings-btn" disabled={isSaving || !canSave} onClick={handleSave}>
        {isSaving ? 'Saving…' : 'Save password'}
      </button>
      {didSave ? (
        <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', marginTop: 10, textAlign: 'center' }}>
          Password updated.
        </p>
      ) : null}
    </SettingsSubScreen>
  );
}
