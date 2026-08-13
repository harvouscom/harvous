import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Vite config for the SPA build (Capacitor + web client)
// The Hono server (server/dev.ts on port 3001) handles all API routes.
// This builds spa/ → dist-spa/ which Capacitor bundles into the native app.
export default defineConfig({
  plugins: [react()],
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
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
