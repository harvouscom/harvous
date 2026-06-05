import type { CSSProperties, ReactNode } from 'react';
import { isClerkAPIResponseError } from '@clerk/clerk-react/errors';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { UserResource } from '@clerk/types';
import { updateCachedProfile } from '../../../../hooks/queries/useProfile';

/** Shared field styles — mirror PrototypeChurchPage so account forms match other settings. */
export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--pds-text-secondary)',
  marginBottom: 6,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 14px',
  border: '0.5px solid var(--pds-border)',
  borderRadius: 'var(--pds-radius-input)',
  background: 'var(--pds-bg-input)',
  fontFamily: 'var(--pds-font-body)',
  fontSize: '0.9375rem',
  color: 'var(--pds-text-primary)',
  outline: 'none',
};

export function Field(props: {
  label: string;
  value: string;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{props.label}</label>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
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
      await user.reload();
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
