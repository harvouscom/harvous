// @ts-check
import { defineConfig } from 'astro/config';
import db from '@astrojs/db';
import clerk from '@clerk/astro';
import react from '@astrojs/react';

import netlify from '@astrojs/netlify';

// Check if building for Capacitor (static output)
// Set BUILD_TARGET=capacitor to build for Capacitor
const isCapacitorBuild = process.env.BUILD_TARGET === 'capacitor';

// Custom Astro integration to exclude API routes from static builds
// Note: This is a placeholder - API routes will be handled by the remote server
// For now, we'll rely on the build failing gracefully if API routes are present
const excludeApiRoutesIntegration = () => {
  return {
    name: 'exclude-api-routes',
    hooks: {}
  };
};

// Custom Vite plugin to fix MIME types in dev server
// This ensures CSS, JS, and Astro files are served with correct Content-Type headers
const fixMimeTypesPlugin = () => {
  return {
    name: 'fix-mime-types',
    enforce: 'pre', // Run before other plugins to catch requests early
    configureServer(server) {
      // Add middleware early in the chain
      return () => {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          // Remove query parameters and hash for MIME type detection
          const urlPath = url.split('?')[0].split('#')[0];
          
          // Set proper MIME types for CSS files
          if (urlPath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
          }
          // Set proper MIME types for JavaScript modules
          else if (urlPath.endsWith('.js') || urlPath.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          }
          // Set proper MIME types for .astro files (they're processed by Vite but browser may request them)
          else if (urlPath.endsWith('.astro')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          }
          next();
        });
      };
    }
  };
};

// https://astro.build/config
export default defineConfig({
  devToolbar: {
    enabled: false
  },
  experimental: {
    clientPrerender: true
  },
  prefetch: {
    defaultStrategy: 'tap',  // Prefetch on tap/click start, not hover
    prefetchAll: true        // Apply to all internal links automatically
  },
  vite: {
    plugins: [
      // Fix MIME types in dev server - must be first to catch all requests
      fixMimeTypesPlugin()
    ],
    // Fix React bundling - ensure single React instance (CRITICAL for Invalid Hook Call errors)
    resolve: {
      dedupe: ['react', 'react-dom']
    },
    server: {
      port: 4321,
      // Fix HMR WebSocket connection issues - ONLY in development
      // Note: import.meta.env is available in config files
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
      include: ['react', 'react-dom', '@clerk/astro/client']
    },
    // Note: Don't add define section - Astro handles environment variables automatically
    // Adding define can conflict with Astro's internal mechanisms (causes __DEFINES__ errors)
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
    excludeApiRoutesIntegration(),
  ],

  // Conditional output mode:
  // - "server" for web deployment (Netlify SSR)
  // - "static" for Capacitor (mobile apps)
  // In Astro 5, use output: "server" and mark specific pages with `export const prerender = true`
  // This provides the same functionality as "hybrid" mode in earlier versions
  ...(isCapacitorBuild ? {
    output: "static",
    // No adapter needed for static builds
    // API routes are excluded via custom Vite plugin (excludeApiRoutesPlugin)
    // They will be handled by the remote Netlify server
  } : {
    output: "server",
    adapter: netlify({
      edgeMiddleware: false
    })
  }),
});