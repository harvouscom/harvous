// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import db from '@astrojs/db';
import clerk from "@clerk/astro";

import netlify from '@astrojs/netlify';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    db(),
    clerk(),
  ],

  experimental: {
    svg: true,
  },

  output: "server",
  adapter: netlify(),
});