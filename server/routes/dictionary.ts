import { Hono } from 'hono';
import { handleAPIError } from '@/utils/error-handling';
import eastonsSlugs from '../data/dictionaries/eastons-slug-index.json';
import eastonsEntries from '../data/dictionaries/eastons.json';

const route = new Hono();

type EastonsEntry = {
  slug: string;
  headword: string;
  category: 'person' | 'place' | 'thing';
  body: string;
  seeAlso: string[];
};

// Build a fast slug → entry map at startup (static data, never changes).
const entryMap = new Map<string, EastonsEntry>(
  (eastonsEntries as EastonsEntry[]).map((e) => [e.slug, e]),
);

// ── GET /api/dictionary/eastons/index ─────────────────────────────────────
// Returns the lightweight slug index. Cached for 7 days — static public-domain data.
route.get('/api/dictionary/eastons/index', async (c) => {
  try {
    c.header('Cache-Control', 'public, max-age=604800, immutable');
    return c.json({ success: true, entries: eastonsSlugs });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/dictionary/eastons/index', action: 'dictionary_index' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

// ── GET /api/dictionary/eastons/:slug ─────────────────────────────────────
// Returns a single dictionary entry. Cached for 7 days.
route.get('/api/dictionary/eastons/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const entry = entryMap.get(slug);
    if (!entry) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
    c.header('Cache-Control', 'public, max-age=604800, immutable');
    return c.json({ success: true, ...entry });
  } catch (error: any) {
    const e = handleAPIError(error, { endpoint: '/api/dictionary/eastons/:slug', action: 'dictionary_entry' });
    return c.json({ error: e.message, code: e.code }, 500);
  }
});

export default route;
