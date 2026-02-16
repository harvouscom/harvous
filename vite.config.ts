import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// Vite config for the SPA build (Capacitor + web client)
// The Astro build (astro.config.mjs) handles the API/server side.
// This builds src/spa/ → dist-spa/ which Capacitor bundles into the native app.
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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'clerk': ['@clerk/clerk-react'],
          'router': ['@tanstack/react-router'],
          'query': ['@tanstack/react-query'],
          'tiptap': [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-bullet-list',
            '@tiptap/extension-highlight',
            '@tiptap/extension-list-item',
            '@tiptap/extension-ordered-list',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-underline',
          ],
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
      // Shim Astro-only modules so shared React components build cleanly in Vite
      'astro:transitions/client': path.resolve(__dirname, 'spa/src/shims/astro-transitions.ts'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 4322,
    proxy: {
      // Proxy API calls to the Astro dev server during development
      '/api': {
        target: 'http://localhost:4321',
        changeOrigin: true,
      },
    },
  },
});
