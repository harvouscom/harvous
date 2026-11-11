import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const clerkKey = process.env.HARVOUS_STAGING_CLERK_PUBLISHABLE_KEY;
if (!clerkKey?.startsWith('pk_test_')) {
  throw new Error('Set HARVOUS_STAGING_CLERK_PUBLISHABLE_KEY to the isolated Clerk test publishable key.');
}

// The local checkout can contain live service settings. Build with an explicit test key
// and let the browser route API traffic through its own isolated Worker origin.
for (const name of Object.keys(process.env)) {
  if (name.startsWith('VITE_') || name.startsWith('PUBLIC_')) delete process.env[name];
}
process.env.VITE_CLERK_PUBLISHABLE_KEY = clerkKey;
process.env.PUBLIC_CLERK_PUBLISHABLE_KEY = clerkKey;

const root = new URL('../', import.meta.url);
const path = (relative) => fileURLToPath(new URL(relative, root));
await build({ envDir: false, build: { outDir: path('dist-child-staging'), emptyOutDir: true } });

for (const name of ['_redirects', '.assetsignore']) {
  await copyFile(path(`cloudflare/${name}`), path(`dist-child-staging/${name}`));
}
const originalHeaders = await readFile(path('cloudflare/_headers'), 'utf8');
const headers = originalHeaders.replace(/(; (?:script-src|frame-src) [^;\n]*)/g, '$1 https://*.clerk.accounts.dev');
if (headers === originalHeaders) throw new Error('Could not apply the test Clerk CSP.');
await writeFile(path('dist-child-staging/_headers'), `${headers}\n/*\n  X-Robots-Tag: noindex, nofollow\n`);
