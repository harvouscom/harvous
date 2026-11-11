/** Production child UI has its own origin, so adult cookies and persisted notebooks are never loaded. */
export function familyPublicConfig(env = process.env) {
  try {
    const childUrl = new URL(env.HARVOUS_CHILD_APP_URL ?? '');
    const privacyUrl = new URL(env.HARVOUS_CHILD_PRIVACY_URL ?? '');
    const parentUrl = new URL(env.HARVOUS_PARENT_APP_URL ?? 'https://app.harvous.com');
    const localParent = env.NODE_ENV !== 'production' && parentUrl.hostname === 'localhost';
    if ((parentUrl.protocol !== 'https:' && !(localParent && parentUrl.protocol === 'http:')) || parentUrl.username || parentUrl.password ||
        parentUrl.pathname !== '/' || parentUrl.hash || parentUrl.search || parentUrl.origin === childUrl.origin) return null;
    const parentSignInUrl = new URL('/sign-in', parentUrl);
    parentSignInUrl.searchParams.set('redirect_url', '/settings/child-accounts');
    const isLocal = env.NODE_ENV !== 'production' && childUrl.hostname === 'localhost';
    if ((childUrl.protocol !== 'https:' && !(isLocal && childUrl.protocol === 'http:')) || privacyUrl.protocol !== 'https:' ||
        childUrl.username || childUrl.password || childUrl.hash || childUrl.search ||
        childUrl.pathname !== '/kids.html' ||
        ['app.harvous.com', 'new.harvous.com', 'harvous.com'].includes(childUrl.hostname)) return null;
    return { childAppUrl: childUrl.href, privacyUrl: privacyUrl.href, childOrigin: childUrl.origin, parentSignInUrl: parentSignInUrl.href };
  } catch { return null; }
}
