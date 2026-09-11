/**
 * The one build identifier this deploy is known by.
 *
 * Two things need to agree on it: the service worker's CACHE_NAME
 * (scripts/inject-sw-cache-version.js) and the `build-id.json` the running client compares
 * itself against (vite.config.ts). If they were derived separately they could disagree, and a
 * client would either nag for an update it already has or miss one it needs.
 *
 * Netlify sets COMMIT_REF (and DEPLOY_ID) on every build, including redeploys of the same
 * commit. GitHub Actions sets GITHUB_SHA instead and sets neither of the others — so the
 * Cloudflare deploy workflow would otherwise fall through to an empty id. Keep all three.
 *
 * Empty locally, on purpose: local builds stay deterministic and don't churn tracked files.
 * `isBuildIdStale` treats an empty id as "cannot tell", never as stale.
 */
export function resolveBuildId() {
  return (process.env.COMMIT_REF || process.env.DEPLOY_ID || process.env.GITHUB_SHA || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8);
}
