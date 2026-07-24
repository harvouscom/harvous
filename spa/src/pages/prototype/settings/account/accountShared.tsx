import type { ReactNode } from 'react';
import { isClerkAPIResponseError } from '@clerk/clerk-react/errors';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { UserResource } from '@clerk/types';
import { updateCachedProfile } from '../../../../hooks/queries/useProfile';

/**
 * Settings/account/church text field — same input chrome as create-sheet
 * (`.proto-create-folder-sheet__name-input` / `.proto-settings-field__input`).
 */
export function Field(props: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="proto-settings-field">
      <span className="proto-settings-field__label">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        className="proto-settings-field__input proto-create-folder-sheet__name-input"
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

/** Inline error line — matches the destructive copy used across settings pages. */
export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p style={{ color: 'var(--pds-destructive)', fontSize: '0.8125rem', margin: '4px 0 12px' }}>
      {children}
    </p>
  );
}

/** Best-effort human message from a Clerk error (mirrors native inline error handling). */
export function getClerkErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    return first?.longMessage || first?.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * After a Clerk profile mutation, reload the user and refresh the app's own
 * profile cache + React Query so the toolbar avatar/name update immediately.
 * Mirrors the cache-sync pattern in AccountMenu.
 */
export function useRefreshProfileAfterMutation() {
  const queryClient = useQueryClient();
  return useCallback(
    async (user: UserResource) => {
      try {
        await user.reload();
      } catch (e) {
        console.error('[useRefreshProfileAfterMutation] user.reload() failed (non-fatal):', e);
      }
      updateCachedProfile({
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        email: user.primaryEmailAddress?.emailAddress ?? '',
        profileImageUrl: user.hasImage ? user.imageUrl : null,
      });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    [queryClient],
  );
}
