import { SignIn, SignUp } from '@clerk/clerk-react';
import { postAuthClerkFallbackUrl, postAuthRedirectPath } from '../../utils/post-auth-redirect';
import { signupAttributionAsUnsafeMetadata } from '../../utils/signup-attribution';
import { classicClerkAuthAppearance } from './clerkAuthAppearance';

export default function ClerkPrebuiltAuth({
  mode,
  redirectRaw,
}: {
  mode: 'signIn' | 'signUp';
  redirectRaw: string | null;
}) {
  const hasCustomRedirect = redirectRaw != null && redirectRaw !== '';
  const redirectPath = postAuthRedirectPath(redirectRaw);
  const clerkFallbackUrl = postAuthClerkFallbackUrl(redirectPath);
  const unsafeMetadata = mode === 'signUp' ? signupAttributionAsUnsafeMetadata() : undefined;

  const shared = {
    routing: 'path' as const,
    path: mode === 'signIn' ? '/sign-in' : '/sign-up',
    fallbackRedirectUrl: clerkFallbackUrl,
    appearance: classicClerkAuthAppearance,
  };

  if (mode === 'signIn') {
    return (
      <SignIn
        {...shared}
        signUpUrl={
          hasCustomRedirect
            ? `/sign-up?redirect_url=${encodeURIComponent(redirectRaw!)}`
            : '/sign-up'
        }
      />
    );
  }

  return (
    <SignUp
      {...shared}
      {...(unsafeMetadata ? { unsafeMetadata } : {})}
      signInUrl={
        hasCustomRedirect
          ? `/sign-in?redirect_url=${encodeURIComponent(redirectRaw!)}`
          : '/sign-in'
      }
    />
  );
}
