import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

/**
 * Dev only: hook modules are invisible to React Fast Refresh, so hot-patch them and the
 * page keeps rendering with a hook list it did not mount with.
 *
 * `@vitejs/plugin-react` stamps `$RefreshSig$` into files it compiles as components — in
 * practice `.tsx`. A custom hook that lives in a plain `.ts` file gets none, and
 * react-refresh skips unsignatured hooks when it decides whether a consumer's hook layout
 * changed. So editing a `.ts` hook to add or remove a hook call — a `useMemo` for
 * reference stability, say — leaves every consuming component's signature looking
 * unchanged. Refresh patches those components in place instead of remounting them, and
 * their live fibers then run a hook list one slot longer than the one they mounted with.
 * React reports "a change in the order of Hooks" and "Should have a queue. You are likely
 * calling Hooks conditionally" against a component that has no conditional hook in it,
 * naming whichever hook happens to sit at the shifted index. The component falls into its
 * error boundary and remounts on every render until the page is reloaded.
 *
 * A full reload on a hook edit costs the page's in-memory state. That is cheaper than a
 * hook-order error that points at the wrong file, and it is what Fast Refresh would do on
 * its own if it could see these modules.
 */
function fullReloadOnHookModuleEdit(): Plugin {
  const isHookModule = (file: string) => {
    if (!file.endsWith('.ts') || file.endsWith('.d.ts')) return false;
    const base = file.slice(file.lastIndexOf('/') + 1);
    return file.includes('/hooks/') || /^use[A-Z]/.test(base);
  };

  return {
    name: 'harvous:full-reload-on-hook-module-edit',
    apply: 'serve',
    handleHotUpdate({ file, server }) {
      if (!isHookModule(file)) return;
      server.ws.send({ type: 'full-reload' });
      return [];
    },
  };
}

// Vite config for the SPA build (Capacitor + web client)
// The Hono server (server/dev.ts on port 3001) handles all API routes.
// This builds spa/ → dist-spa/ which Capacitor bundles into the native app.
export default defineConfig({
  plugins: [react(), fullReloadOnHookModuleEdit()],
  root: 'spa',
  // Serve public assets (fonts, icons, manifest, sw.js) from the project root's public/
  publicDir: path.resolve(__dirname, 'public'),
  // Load .env from the project root (not spa/) where all env vars live
  envDir: path.resolve(__dirname),
  // VITE_* for SPA config; PUBLIC_* keeps PostHog (and legacy Astro-style) keys available to the client
  envPrefix: ['VITE_', 'PUBLIC_'],
  build: {
    outDir: '../dist-spa',
    emptyOutDir: true,
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Matched on resolved module path, not package name. The object form
        // (`{'react-vendor': ['react', 'react-dom']}`) silently produced a 1-byte
        // react-vendor chunk and shipped React inside the main bundle: React's real code
        // lives in `react/cjs/react.production.js`, reached through the package entry, and
        // the entry alone is what the object form moves. The build succeeded and the split
        // never happened. `scripts/check-perf-budget.mjs` now fails on an empty named chunk
        // so this cannot go unnoticed again.
        //
        // Each test needs the trailing slash: `node_modules/react/` must not swallow
        // `node_modules/react-dom/` or `node_modules/react-is/`.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-vendor';
          if (id.includes('node_modules/@clerk/')) return 'clerk';
          if (id.includes('node_modules/@tanstack/react-router')) return 'router';
          if (id.includes('node_modules/@tanstack/react-query')) return 'query';
          if (id.includes('node_modules/@tiptap/')) return 'tiptap';
        },
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'app-navigate': path.resolve(__dirname, 'spa/src/shims/app-navigate.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 4322,
    /*
     * Bind both loopback stacks.
     *
     * This line has now been wrong in both directions, so the history is worth keeping.
     *
     * Vite's default host is `localhost`, and Node 17+ resolves that verbatim — which on this
     * machine hands back `::1` first, so the dev server bound IPv6 loopback only and
     * `http://127.0.0.1:4322` was refused. Anything preferring IPv4 (some browsers, Electron
     * shells, `curl -4`, other tooling) could not reach it. The fix was to pin `127.0.0.1` —
     * which bound IPv4 *only* and refused `[::1]`, breaking `localhost` instead. Vite then
     * advertised `http://127.0.0.1:4322` in its startup banner, and that address is not in
     * `DEDICATED_PROTOTYPE_HOSTS` (src/lib/prototype-path.ts), so following the printed link
     * landed on Classic rather than the 2.0 prototype — "the dev server is showing an old
     * design", a routing symptom with a networking cause.
     *
     * Neither pin can serve both: one address is IPv4, the other IPv6. `::` is the any-address,
     * and Node opens it dual-stack, so `[::1]` and `127.0.0.1` both answer. Vite prints
     * `localhost` again, which is the address the rest of the app is configured around.
     *
     * The cost is the `Network:` line in the banner — `::` reaches every interface, so the dev
     * server is visible on the LAN. If that is not wanted, delete this line entirely: the vite
     * default binds `[::1]` only, which fixes `localhost` and re-breaks `127.0.0.1`.
     *
     * Verify with a real IPv6 client, not `curl` — curl falls back to IPv4 on its own and
     * reports success against a server that only answers on one stack. That fallback is why
     * this was previously recorded as "verified both addresses answer" when only one did.
     */
    host: '::',
    /*
     * Named tunnel hosts, for testing on a real phone.
     *
     * Web Push needs a secure context, so a phone cannot reach the dev server over
     * `http://192.168.x.x` — Safari and Chrome both withhold the API there. A tunnel
     * (`cloudflared tunnel --url http://localhost:4322`) gives an HTTPS origin that does
     * qualify, but Vite rejects hosts it was not told about, which surfaces as a bare
     * "Blocked request" page rather than anything about tunnels.
     *
     * Suffix entries, not wildcards in the URL sense: Vite matches `.example.com` against any
     * subdomain of it. Quick tunnels get a random subdomain each run, so listing the suffix is
     * what keeps this from needing an edit per session.
     */
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
    watch: {
      // Also watch shared src/ components (outside the spa/ root) for HMR
      ignored: ['!**/src/**'],
    },
    proxy: {
      // All API calls → Hono dev server (port 3001). If the API is not running, you get 500 — use npm run dev:all to run both.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('[vite proxy] API request failed (is the API running on port 3001?):', req.url);
            console.error('[vite proxy] Run "npm run dev:all" to start both the API and SPA, or "npm run dev:api" in another terminal.');
            if (res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: 'API not running',
                  hint: 'Run npm run dev:all to start both the API and SPA.',
                })
              );
            }
          });
        },
      },
    },
  },
  // `vite preview` serves the real built output — hashed chunks, manualChunks splits, minified
  // — which dev mode never exercises. Without this proxy every /api call 404s against the static
  // server, so the only way to look at a production build was to deploy it. Any bundle or
  // chunk-ordering work needs to load the built app against a live API to be verifiable.
  preview: {
    port: 4324,
    // Same reason as the dev server's list above: testing push on a real phone needs an
    // HTTPS origin, and the built output is what a phone should be served over a tunnel —
    // dev mode's hundreds of unbundled module requests are slow and drop-prone over one.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.loca.lt'],
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
