// Astro DB seed file (TypeScript module format)
// This file is required by Astro DB integration
// The actual seed data is in db/seed.ts for TypeScript usage
import { db } from 'astro:db';

export default async function() {
  // Empty seed function - actual seeding is done via db/seed.ts
  // This file exists to satisfy Astro DB's requirement for seed.mts
  console.log('Astro DB seed.mts loaded (using db/seed.ts for actual seeding)');
}

