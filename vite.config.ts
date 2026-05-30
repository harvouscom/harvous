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
  build: {
    outDir: '../dist-spa',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'clerk': ['@clerk/clerk-react'],
          'router': ['@tanstack/react-router'],
          'query': ['@tanstack/react-query'],
          'tiptap': ['@tiptap/react', '@tiptap/core', '@tiptap/starter-kit'],
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
});
