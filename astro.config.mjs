// @ts-check
import { defineConfig } from 'astro/config';
import clerk from "@clerk/astro";
import tailwindcss from '@tailwindcss/vite';
import alpinejs from '@astrojs/alpinejs';
import db from '@astrojs/db';

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    alpinejs({
      entrypoint: './src/entrypoint.ts'
    }),
    db(),
    clerk(),
  ],

  output: "server",
  adapter: netlify(),
});