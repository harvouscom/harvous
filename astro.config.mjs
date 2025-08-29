// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import clerkIntegration from '@clerk/astro';
import tailwind from '@astrojs/tailwind';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  vite: {
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
      include: ['alpinejs', 'trix']
    },
    // Improve CSS handling
    css: {
      devSourcemap: false
    }
  },

  integrations: [
    db(),
    clerkIntegration(),
    tailwind(),
  ],

  experimental: {
    svg: true,
  },

  output: "server",
  adapter: netlify({
    // Optimize for Netlify
  }),
});