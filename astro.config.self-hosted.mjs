// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Self-hosted configuration - no Clerk, no Astro DB
// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  experimental: {
    clientPrerender: true
  },
  prefetch: {
    defaultStrategy: 'hover',
    prefetchAll: false
  },
  vite: {
    server: {
      port: 4321,
      hmr: {
        port: 4321,
        clientPort: 4321,
        overlay: false,
        host: 'localhost'
      },
      fs: {
        strict: false
      },
      headers: {
        'Cache-Control': 'no-cache'
      }
    },
    build: {
      chunkSizeWarningLimit: 1000,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
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
    optimizeDeps: {
      exclude: [],
    },
    define: {
      _DEFINES_: JSON.stringify({}),
      'import.meta.env.DEV': JSON.stringify(import.meta.env.DEV),
      'import.meta.env.PROD': JSON.stringify(import.meta.env.PROD),
      'import.meta.env.SELF_HOSTED': JSON.stringify('true')
    },
    css: {
      devSourcemap: false
    }
  },

  integrations: [
    react(),
    // Note: No db() or clerk() integrations for self-hosted mode
  ],

  output: "server",
  // For self-hosted, we'll use Node.js adapter instead of Netlify
  adapter: undefined, // Will need to add @astrojs/node adapter for production
});

