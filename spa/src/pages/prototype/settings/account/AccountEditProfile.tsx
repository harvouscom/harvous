import { useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import Icon from '@/components/react/Icon';
import { resolveClerkProfileImageUrl } from '../../../../lib/clerk-profile-image';
import { SettingsSubScreen } from '../SettingsShell';
import { ErrorText, Field, getClerkErrorMessage, useRefreshProfileAfterMutation } from './accountShared';

/** Edit display name + profile photo. Mirrors native HarvousMacUserProfileEditView. */
export default function AccountEditProfile({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const refreshProfile = useRefreshProfileAfterMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);

  if (!user) return null;

  const photoUrl = resolveClerkProfileImageUrl(user, null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      await refreshProfile(user);
      setSavedAt(Date.now());
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't save your name."));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoSelected = async (file: File | undefined) => {
    if (!file) return;
    setIsPhotoBusy(true);
    setError(null);
    try {
      await user.setProfileImage({ file });
      await refreshProfile(user);
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't update your photo."));
    } finally {
      setIsPhotoBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    setIsPhotoBusy(true);
    setError(null);
    try {
      await user.setProfileImage({ file: null });
      await refreshProfile(user);
    } catch (e) {
      setError(getClerkErrorMessage(e, "Couldn't remove your photo."));
    } finally {
      setIsPhotoBusy(false);
    }
  };

  return (
    <SettingsSubScreen title="Edit profile" onBack={onBack}>
      {/* Avatar + photo actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPhotoBusy}
          aria-label="Change profile photo"
          style={{
            position: 'relative',
            width: 88,
            height: 88,
            borderRadius: '50%',
            border: 'none',
            padding: 0,
            background: 'var(--pds-bg-input)',
            cursor: isPhotoBusy ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--pds-text-tertiary)',
            overflow: 'visible',
          }}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="proto-profile-orb__photo" />
          ) : (
            <Icon name="circle-user" size={56} />
          )}
          <span
            aria-hidden
            className="proto-account-photo-badge"
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--pds-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--pds-bg-page)',
            }}
          >
            <Icon name="pen-to-square" size={11} />
          </span>
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary"
            style={{ width: 'auto', padding: '8px 14px' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={isPhotoBusy}
          >
            {photoUrl ? 'Change photo' : 'Add photo'}
          </button>
          {photoUrl ? (
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary"
              style={{ width: 'auto', padding: '8px 14px', color: 'var(--pds-destructive)' }}
              onClick={handleRemovePhoto}
              disabled={isPhotoBusy}
            >
              Remove
            </button>
          ) : null}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handlePhotoSelected(e.target.files?.[0])}
        />
      </div>

      <Field label="First name" value={firstName} placeholder="First name" autoComplete="given-name" onChange={setFirstName} />
      <Field label="Last name" value={lastName} placeholder="Last name" autoComplete="family-name" onChange={setLastName} />

      <ErrorText>{error}</ErrorText>

      <button type="button" onClick={handleSave} disabled={isSaving} className="proto-settings-btn" style={{ marginTop: 8 }}>
        {isSaving ? 'Saving…' : 'Save'}
      </button>
      {savedAt ? (
        <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)', marginTop: 10, textAlign: 'center' }}>
          Saved.
        </p>
      ) : null}
    </SettingsSubScreen>
  );
}
