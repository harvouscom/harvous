// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import clerk from '@clerk/astro';
import tailwind from '@astrojs/tailwind';
import alpinejs from '@astrojs/alpinejs';
import react from '@astrojs/react';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  experimental: {
    clientPrerender: true
  },
  vite: {
    server: {
      port: 4321,
      // Fix HMR WebSocket connection issues
      hmr: {
        port: 4321,
        clientPort: 4321,
        overlay: false,
        host: 'localhost'
      },
      // Fix MIME type issues for .astro files
      fs: {
        strict: false
      },
      // Additional headers for development
      headers: {
        'Cache-Control': 'no-cache'
      }
    },
    build: {
      // Optimize chunks to improve browser performance
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // Improve chunk splitting for better caching
          manualChunks: {
            alpinejs: ['alpinejs', '@alpinejs/collapse', '@alpinejs/focus'],
            editor: ['trix', 'isomorphic-dompurify']
          }
        }
      }
    },
    // Add performance optimizations to Vite dev server
    optimizeDeps: {
      exclude: [],
      include: ['alpinejs', 'trix', '@clerk/astro/client']
    },
    // Fix MIME type issues in development
    define: {
      _DEFINES_: JSON.stringify({}),
      // Fix environment variable issues
      'import.meta.env.DEV': JSON.stringify(import.meta.env.DEV),
      'import.meta.env.PROD': JSON.stringify(import.meta.env.PROD)
    },
    // Improve CSS handling
    css: {
      devSourcemap: false
    }
  },

  integrations: [
    db(),
    clerk({
      enableEnvSchema: true
    }),
    tailwind(),
    alpinejs(),
    react(),
  ],

  // Use different output modes for development vs production
  output: "server",
  adapter: import.meta.env.DEV ? undefined : netlify({
    // Only use Netlify adapter in production
    edgeMiddleware: false
  }),
});