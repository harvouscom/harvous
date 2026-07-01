/** Origins allowed to call the API with credentials (marketing site + app + local dev). */
export const CORS_ALLOWED_ORIGINS = new Set([
  'https://harvous.com',
  'https://www.harvous.com',
  'https://app.harvous.com',
  'https://new.harvous.com',
  'http://localhost:4321',
  'http://localhost:4322',
  'http://127.0.0.1:4321',
  'http://127.0.0.1:4322',
  'http://localhost:3001',
]);

export function resolveCorsOrigin(requestOrigin: string | undefined): string | null {
  if (!requestOrigin) return null;
  return CORS_ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : null;
}
