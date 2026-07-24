/**
 * Clerk JWT v2 encodes billing features in `fea` as scoped slugs, e.g.
 * `u:shared_spaces` (user) or `o:dashboard` (organization). Legacy tokens
 * may list bare slugs. Client SDK `has()` understands both; server auth must too.
 */
export function jwtHasFeature(payload: Record<string, unknown>, feature: string): boolean {
  const fea = payload.fea;
  if (!fea) return false;

  const entries: string[] = [];
  if (typeof fea === 'string') {
    entries.push(...fea.split(',').map((s) => s.trim()).filter(Boolean));
  } else if (Array.isArray(fea)) {
    entries.push(...fea.map(String));
  } else {
    return false;
  }

  return entries.some((entry) => {
    if (entry === feature) return true;
    const colon = entry.indexOf(':');
    if (colon >= 0) return entry.slice(colon + 1) === feature;
    return false;
  });
}
