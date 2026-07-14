/** Marketing attribution from harvous.com signup CTAs → Clerk unsafeMetadata. */

export const SIGNUP_ATTRIBUTION_COOKIE = "harvous_signup_src";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COOKIE_DAYS = 7;

export type SignupAttribution = {
  marketingAudience?: string;
  marketingUseCase?: string;
  marketingSource?: string;
};

export function sanitizeSignupSlug(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  return SLUG_RE.test(trimmed) ? trimmed : undefined;
}

export function readSignupAttributionFromSearch(
  search: string | URLSearchParams = typeof window !== "undefined" ? window.location.search : ""
): SignupAttribution {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const attribution: SignupAttribution = {};
  const audience = sanitizeSignupSlug(params.get("audience"));
  const useCase = sanitizeSignupSlug(params.get("use_case"));
  const source = sanitizeSignupSlug(params.get("source"));
  if (audience) attribution.marketingAudience = audience;
  if (useCase) attribution.marketingUseCase = useCase;
  if (source) attribution.marketingSource = source;
  return attribution;
}

export function hasSignupAttribution(attribution: SignupAttribution): boolean {
  return Boolean(
    attribution.marketingAudience || attribution.marketingUseCase || attribution.marketingSource
  );
}

/** Persist query attribution so email-code multi-step signup still has it. */
export function persistSignupAttributionCookie(attribution: SignupAttribution): void {
  if (typeof document === "undefined" || !hasSignupAttribution(attribution)) return;
  const expires = new Date(Date.now() + COOKIE_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  const value = encodeURIComponent(JSON.stringify(attribution));
  document.cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=${value}; path=/; expires=${expires}; SameSite=Lax`;
}

export function readSignupAttributionCookie(): SignupAttribution {
  if (typeof document === "undefined") return {};
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SIGNUP_ATTRIBUTION_COOKIE}=`));
  if (!match) return {};
  const raw = decodeURIComponent(match.slice(SIGNUP_ATTRIBUTION_COOKIE.length + 1));
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attribution: SignupAttribution = {};
    if (typeof parsed.marketingAudience === "string") {
      const audience = sanitizeSignupSlug(parsed.marketingAudience);
      if (audience) attribution.marketingAudience = audience;
    }
    if (typeof parsed.marketingUseCase === "string") {
      const useCase = sanitizeSignupSlug(parsed.marketingUseCase);
      if (useCase) attribution.marketingUseCase = useCase;
    }
    if (typeof parsed.marketingSource === "string") {
      const source = sanitizeSignupSlug(parsed.marketingSource);
      if (source) attribution.marketingSource = source;
    }
    return attribution;
  } catch {
    return {};
  }
}

/** Prefer live query params, fall back to cookie. */
export function resolveSignupAttribution(): SignupAttribution {
  const fromQuery = readSignupAttributionFromSearch();
  if (hasSignupAttribution(fromQuery)) return fromQuery;
  return readSignupAttributionCookie();
}

export function clearSignupAttributionCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIGNUP_ATTRIBUTION_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/** Shape passed to Clerk `signUp.create({ unsafeMetadata })` / `<SignUp unsafeMetadata>`. */
export function signupAttributionAsUnsafeMetadata(
  attribution: SignupAttribution = resolveSignupAttribution()
): SignupAttribution | undefined {
  return hasSignupAttribution(attribution) ? attribution : undefined;
}
