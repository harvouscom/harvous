/**
 * Reader view for a saved link: the article's own text, without the site around it.
 *
 * Never throws for the page's sake. A paywall, a 404, a page that is all script, a host
 * we refuse to fetch — each is an ordinary answer (`readable: false`) that the viewer
 * turns into the item's card and a way out, not an error state.
 */
import { extractArticleContent } from '@/utils/content-extractor';
import { fetchPublicText, UnsafeUrlError, type LookupFn } from './public-url-fetch';

export type ResourceReaderResult =
  | { readable: true; html: string; wordCount: number }
  | {
      readable: false;
      reason: 'unsafe_url' | 'fetch_failed' | 'not_html' | 'no_article';
    };

/** Shorter than this and what came back is a cookie wall or a teaser, not an article. */
const MIN_ARTICLE_WORDS = 80;

const USER_AGENT = 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://app.harvous.com)';

export async function readResourceArticle(
  sourceUrl: string,
  deps: { fetchImpl?: typeof fetch; lookup?: LookupFn } = {},
): Promise<ResourceReaderResult> {
  let page;
  try {
    page = await fetchPublicText(sourceUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      },
      ...deps,
    });
  } catch (error) {
    return { readable: false, reason: error instanceof UnsafeUrlError ? 'unsafe_url' : 'fetch_failed' };
  }
  if (page.status < 200 || page.status >= 300) return { readable: false, reason: 'fetch_failed' };
  if (!/html/i.test(page.contentType)) return { readable: false, reason: 'not_html' };

  let html: string | null = null;
  try {
    html = await extractArticleContent(page.body, page.url.toString());
  } catch {
    html = null;
  }
  const text = html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';
  const wordCount = text ? text.split(' ').length : 0;
  if (!html || wordCount < MIN_ARTICLE_WORDS) return { readable: false, reason: 'no_article' };
  return { readable: true, html, wordCount };
}
