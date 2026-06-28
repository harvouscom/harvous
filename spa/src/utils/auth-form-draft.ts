export const AUTH_FORM_DRAFT_KEY = 'harvous-auth-draft';
export const AUTH_SIGNUP_PROFILE_KEY = 'harvous-auth-signup-profile';

export type AuthFormStep = 'enterEmail' | 'enterCode';

export type AuthFormDraft = {
  mode: 'signIn' | 'signUp';
  step: AuthFormStep;
  email: string;
  firstName?: string;
  lastName?: string;
};

function parseStoredDraft(): AuthFormDraft | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_FORM_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthFormDraft;
    if (parsed.step !== 'enterEmail' && parsed.step !== 'enterCode') return null;
    if (typeof parsed.email !== 'string') return null;
    if (parsed.mode !== 'signIn' && parsed.mode !== 'signUp') return null;
    return parsed;
  } catch {
    return null;
  }
}

function readSignUpProfile(): Pick<AuthFormDraft, 'firstName' | 'lastName'> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(AUTH_SIGNUP_PROFILE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { firstName?: string; lastName?: string };
    return {
      firstName: typeof parsed.firstName === 'string' ? parsed.firstName : '',
      lastName: typeof parsed.lastName === 'string' ? parsed.lastName : '',
    };
  } catch {
    return {};
  }
}

function withSignUpProfile(draft: AuthFormDraft): AuthFormDraft {
  if (draft.mode !== 'signUp') return draft;
  const profile = readSignUpProfile();
  return {
    ...draft,
    firstName: draft.firstName ?? profile.firstName ?? '',
    lastName: draft.lastName ?? profile.lastName ?? '',
  };
}

/** Restore auth form state; email carries across sign-in ↔ sign-up footer links. */
export function readAuthDraft(mode: 'signIn' | 'signUp'): AuthFormDraft | null {
  const parsed = parseStoredDraft();
  if (!parsed) return null;

  if (parsed.mode === mode) {
    return withSignUpProfile(parsed);
  }

  // Cross-mode: keep email, restart at the email step (OTP is never shared).
  const crossMode: AuthFormDraft = {
    mode,
    step: 'enterEmail',
    email: parsed.email,
  };
  return withSignUpProfile(crossMode);
}

export function writeAuthDraft(draft: AuthFormDraft): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(AUTH_FORM_DRAFT_KEY, JSON.stringify(draft));
    if (draft.mode === 'signUp') {
      sessionStorage.setItem(
        AUTH_SIGNUP_PROFILE_KEY,
        JSON.stringify({
          firstName: draft.firstName ?? '',
          lastName: draft.lastName ?? '',
        }),
      );
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearAuthDraft(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_FORM_DRAFT_KEY);
    sessionStorage.removeItem(AUTH_SIGNUP_PROFILE_KEY);
  } catch {
    /* ignore */
  }
}
