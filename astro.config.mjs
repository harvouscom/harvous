// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import clerk from '@clerk/astro';
import tailwind from '@astrojs/tailwind';

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
  ],

  // Always use server output for Clerk SSR compatibility
  output: "server",
  adapter: netlify({}),
});