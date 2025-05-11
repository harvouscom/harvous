// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import db from '@astrojs/db';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    db(),
  ],

  experimental: {
    svg: true,
  },

  output: "server",
  adapter: netlify(),
});