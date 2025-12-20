// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import clerk from '@clerk/astro';
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
  prefetch: {
    defaultStrategy: 'hover',  // Prefetch when user hovers over link
    prefetchAll: false         // Only prefetch on hover, not all links
  },
  vite: {
    // Fix React bundling - ensure single React instance (CRITICAL for Invalid Hook Call errors)
    resolve: {
      dedupe: ['react', 'react-dom']
    },
    server: {
      port: 4321,
      // Fix HMR WebSocket connection issues - ONLY in development
      ...(import.meta.env.DEV && {
        hmr: {
          port: 4321,
          clientPort: 4321,
          overlay: false,
          host: 'localhost'
        }
      }),
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
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true
      },
      rollupOptions: {
        output: {
          // Improve chunk splitting for better caching
          manualChunks: {
            // CRITICAL: Ensure React is in a single vendor chunk
            'react-vendor': ['react', 'react-dom'],
            editor: ['isomorphic-dompurify'],
            tiptap: [
              '@tiptap/react',
              '@tiptap/starter-kit',
              '@tiptap/extension-bullet-list',
              '@tiptap/extension-highlight',
              '@tiptap/extension-list-item',
              '@tiptap/extension-ordered-list',
              '@tiptap/extension-placeholder',
              '@tiptap/extension-underline'
            ],
            radix: [
              '@radix-ui/react-dialog',
              '@radix-ui/react-popover',
              '@radix-ui/react-slot',
              '@radix-ui/react-switch',
              '@radix-ui/react-toggle'
            ]
          }
        }
      }
    },
    // Add performance optimizations to Vite dev server
    optimizeDeps: {
      exclude: [],
      include: ['react', 'react-dom', '@astrojs/react/client', '@clerk/astro/client']
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
    react(),
  ],

  // Use different output modes for development vs production
  output: "server",
  adapter: import.meta.env.DEV ? undefined : netlify({
    // Only use Netlify adapter in production
    edgeMiddleware: false
  }),
});