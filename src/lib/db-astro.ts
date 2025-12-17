/**
 * Astro DB Adapter Wrapper
 * 
 * Wraps Astro DB to provide the same interface as the PostgreSQL adapter
 * This allows code to work with both database backends
 */

import { db as astroDb } from 'astro:db';

/**
 * Re-export Astro DB as the adapter
 * The Astro DB API is already compatible with our adapter interface
 */
export default astroDb;

