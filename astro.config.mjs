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
  experimental: {
    clientPrerender: true
  },
  vite: {
    server: {
      // Fix HMR WebSocket connection issues
      hmr: {
        port: 4322,
        clientPort: 4322,
        overlay: false
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
    },
    // Fix MIME type issues and module loading
    define: {
      __DEFINES__: '{}',
      'process.env.NODE_ENV': '"development"'
    },
    ssr: {
      noExternal: ['@clerk/astro']
    },
    // Prevent CSS and Astro files from being treated as JS modules
    plugins: []
  },

  integrations: [
    db(),
    clerkIntegration({
      enableEnvSchema: true
    }),
    tailwind(),
  ],



  output: "server",
  adapter: netlify({
    // Optimize for Netlify
  }),
});