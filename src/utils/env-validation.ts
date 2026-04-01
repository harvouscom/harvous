/**
 * Environment Variable Validation
 * 
 * Validates required and recommended environment variables on startup.
 * Fails fast with clear error messages if critical variables are missing.
 */

interface ValidationResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate required environment variables
 * Returns validation result with missing variables and warnings
 */
export function validateEnvironmentVariables(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required environment variables
  const clerkKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY;
  const clerkSecret = import.meta.env.CLERK_SECRET_KEY;
  const dbUrl = import.meta.env.SUPABASE_DATABASE_URL ?? import.meta.env.SUPABASE_DIRECT_URL;

  if (!clerkKey || String(clerkKey).trim() === '') missing.push('PUBLIC_CLERK_PUBLISHABLE_KEY');
  if (!clerkSecret || String(clerkSecret).trim() === '') missing.push('CLERK_SECRET_KEY');
  if (!dbUrl || String(dbUrl).trim() === '') missing.push('SUPABASE_DATABASE_URL');

  // Recommended but optional variables
  const recommended = {
    PUBLIC_POSTHOG_KEY: import.meta.env.PUBLIC_POSTHOG_KEY,
    WEBFLOW_INBOX_API_TOKEN: import.meta.env.WEBFLOW_INBOX_API_TOKEN,
  };

  // Check recommended variables
  for (const [key, value] of Object.entries(recommended)) {
    if (!value || value.trim() === '') {
      warnings.push(key);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validate and throw error if required variables are missing
 * Use this in middleware or startup code to fail fast
 */
export function validateAndThrow(): void {
  const result = validateEnvironmentVariables();

  if (!result.isValid) {
    const errorMessage = `Missing required environment variables: ${result.missing.join(', ')}`;
    console.error('Environment validation failed:', errorMessage);
    throw new Error(errorMessage);
  }

  if (result.warnings.length > 0) {
    console.warn('Missing recommended environment variables:', result.warnings.join(', '));
  }
}

/**
 * Get validation status (for logging/reporting)
 */
export function getValidationStatus(): ValidationResult {
  return validateEnvironmentVariables();
}

