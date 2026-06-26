import { useState, useEffect, useSyncExternalStore } from 'react';
import { useSignIn, useSignUp } from '@clerk/clerk-react';
import type { SignUpResource } from '@clerk/types';
import { useNavigate } from '@tanstack/react-router';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { postAuthRedirectPath } from '../../utils/post-auth-redirect';

function missingIncludesName(missing: string[], part: 'first' | 'last'): boolean {
  const keys =
    part === 'first'
      ? ['first_name', 'firstName']
      : ['last_name', 'lastName'];
  return missing.some((field) => keys.includes(field));
}

function incompleteSignUpMessage(signUp: SignUpResource, status: string): string {
  if (import.meta.env.DEV) {
    console.warn('[HarvousAuthForm] sign-up incomplete', {
      status,
      missingFields: signUp.missingFields,
      unverifiedFields: signUp.unverifiedFields,
    });
  }
  if (status === 'missing_requirements') {
    const missing = signUp.missingFields ?? [];
    if (missing.some((field) => field === 'captcha' || field === 'bot_detection')) {
      return 'Complete the verification check above, then try again.';
    }
    if (missingIncludesName(missing, 'first') || missingIncludesName(missing, 'last')) {
      return 'Enter your first and last name, then try again.';
    }
    if (missing.length > 0) {
      return 'Additional information is required to finish sign-up. Please go back and try again.';
    }
    return 'Complete any verification checks on the previous step, then try again.';
  }
  return 'Could not complete sign-up. Please try again.';
}

async function applyMissingSignUpProfile(
  signUp: SignUpResource,
  profile: { firstName: string; lastName: string }
): Promise<SignUpResource> {
  const missing = signUp.missingFields ?? [];
  const patch: { firstName?: string; lastName?: string } = {};
  if (missingIncludesName(missing, 'first')) patch.firstName = profile.firstName;
  if (missingIncludesName(missing, 'last')) patch.lastName = profile.lastName;
  if (Object.keys(patch).length === 0) return signUp;
  return signUp.update(patch);
}

/**
 * Custom Clerk-headless auth form that drives `useSignIn()` / `useSignUp()`
 * directly. Renders the same email-code flow as the native macOS sign-in
 * (`MacSignInView.swift`) so the visual is identical across surfaces.
 * Replaces Clerk's prebuilt `<SignIn>` / `<SignUp>` components so no Clerk
 * card chrome, dev-mode striped banner, or built-in CTAs leak SPA styling.
 *
 * Sign-up steps:
 *   1. Enter name + email → Clerk sends a 6-digit one-time code.
 *   2. Enter code → activate the new session, redirect.
 * Sign-in steps: email → code.
 */
export default function HarvousAuthForm({
  mode,
}: {
  mode: 'signIn' | 'signUp';
}) {
  const { isLoaded: signInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();
  const navigate = useNavigate();
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light');
  const captchaTheme = colorScheme === 'dark' ? 'dark' : 'light';

  type Step = 'enterEmail' | 'enterCode';
  const [step, setStep] = useState<Step>('enterEmail');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-focus the code field once it appears.
  useEffect(() => {
    if (step !== 'enterCode') return;
    const id = window.setTimeout(() => {
      document.getElementById('harvous-auth-code')?.focus();
    }, 40);
    return () => window.clearTimeout(id);
  }, [step]);

  const isValidEmail = (s: string) => {
    const t = s.trim();
    return t.includes('@') && t.includes('.') && t.length >= 5;
  };
  const ready =
    mode === 'signIn' ? signInLoaded && !!signIn : signUpLoaded && !!signUp;
  const signUpProfileReady =
    firstName.trim().length > 0 && lastName.trim().length > 0;
  const canBeginEmailFlow =
    mode === 'signIn'
      ? isValidEmail(email)
      : isValidEmail(email) && signUpProfileReady;

  function friendlyError(err: any): string {
    const m: string =
      err?.errors?.[0]?.longMessage ||
      err?.errors?.[0]?.message ||
      err?.message ||
      'Something went wrong. Please try again.';
    return m;
  }

  function redirectAfterAuth() {
    const params = new URLSearchParams(window.location.search);
    const target = postAuthRedirectPath(params.get('redirect_url'));
    navigate({ to: target as any });
  }

  async function beginEmailFlow(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !canBeginEmailFlow) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const trimmed = email.trim();
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      if (mode === 'signIn' && signIn) {
        const attempt = await signIn.create({ identifier: trimmed });
        const factor = attempt.supportedFirstFactors?.find(
          (f) => f.strategy === 'email_code'
        ) as { strategy: 'email_code'; emailAddressId: string } | undefined;
        if (!factor) {
          throw new Error("This email isn't set up for code sign-in. Try a different email or contact support.");
        }
        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: factor.emailAddressId,
        });
      } else if (mode === 'signUp' && signUp) {
        await signUp.create({
          emailAddress: trimmed,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
        });
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      }
      setStep('enterCode');
    } catch (err: any) {
      setErrorMessage(friendlyError(err));
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const trimmed = code.trim();
      if (mode === 'signIn' && signIn) {
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: trimmed,
        });
        if (result.status === 'complete' && result.createdSessionId) {
          await setSignInActive({ session: result.createdSessionId });
          redirectAfterAuth();
        } else {
          setErrorMessage('Could not complete log-in. Please try again.');
        }
      } else if (mode === 'signUp' && signUp) {
        let result = await signUp.attemptEmailAddressVerification({ code: trimmed });
        if (result.status === 'missing_requirements') {
          result = await applyMissingSignUpProfile(result, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          });
        }
        if (result.status === 'complete' && result.createdSessionId) {
          await setSignUpActive({ session: result.createdSessionId });
          redirectAfterAuth();
        } else {
          setErrorMessage(incompleteSignUpMessage(result, result.status));
        }
      }
    } catch (err: any) {
      setErrorMessage(friendlyError(err));
    } finally {
      setIsBusy(false);
    }
  }

  function useDifferentEmail() {
    setStep('enterEmail');
    setCode('');
    setErrorMessage(null);
  }

  return (
    <div className="harvous-auth-form">
      {step === 'enterEmail' ? (
        <form onSubmit={beginEmailFlow} className="harvous-auth-form__inner">
          {mode === 'signUp' ? (
            <div className="harvous-auth-form__name-row">
              <input
                type="text"
                autoComplete="given-name"
                autoFocus
                placeholder="First name"
                className="harvous-auth-form__input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                aria-label="First name"
              />
              <input
                type="text"
                autoComplete="family-name"
                placeholder="Last name"
                className="harvous-auth-form__input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                aria-label="Last name"
              />
            </div>
          ) : null}
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus={mode === 'signIn'}
            placeholder="Enter your email"
            className="harvous-auth-form__input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email address"
          />
          {mode === 'signUp' ? (
            <div
              id="clerk-captcha"
              className="harvous-auth-form__captcha"
              data-cl-theme={captchaTheme}
              data-cl-size="normal"
            />
          ) : null}
          <button
            type="submit"
            className="harvous-auth-form__primary"
            disabled={isBusy || !ready || !canBeginEmailFlow}
          >
            {isBusy ? (
              <span className="harvous-auth-form__spinner" aria-hidden />
            ) : mode === 'signIn' ? (
              'Log in with email'
            ) : (
              'Send sign-in code'
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="harvous-auth-form__inner">
          <p className="harvous-auth-form__hint">
            Enter the 6-digit code we sent to <strong>{email}</strong>.
          </p>
          <input
            id="harvous-auth-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="harvous-auth-form__input harvous-auth-form__input--code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            aria-label="Verification code"
          />
          <button
            type="submit"
            className="harvous-auth-form__primary"
            disabled={isBusy || !ready || code.length < 4}
          >
            {isBusy ? (
              <span className="harvous-auth-form__spinner" aria-hidden />
            ) : (
              'Verify and continue'
            )}
          </button>
          <button
            type="button"
            onClick={useDifferentEmail}
            className="harvous-auth-form__secondary-link"
          >
            Use a different email
          </button>
        </form>
      )}

      {errorMessage && (
        <p className="harvous-auth-form__error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
