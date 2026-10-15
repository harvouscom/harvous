import { describe, expect, it, vi } from 'vitest';
import { readResourceArticle } from '../resource-reader';
import type { LookupFn } from '../public-url-fetch';

const lookup: LookupFn = async (host) => (host === 'example.org' ? [{ address: '93.184.215.14' }] : []);

const paragraph = (n: number) =>
  `<p>${Array.from({ length: 40 }, (_, i) => `word${n}x${i}`).join(' ')} — the gospel is good news.</p>`;

const articlePage = `<!doctype html><html><head><title>What is the gospel?</title></head>
<body><nav>Home · About · Donate</nav><main><article><h1>What is the gospel?</h1>
${Array.from({ length: 8 }, (_, i) => paragraph(i)).join('\n')}
</article></main><footer>© Example</footer></body></html>`;

const respond = (body: string, contentType = 'text/html; charset=utf-8', status = 200) =>
  vi.fn(async () => new Response(body, { status, headers: { 'content-type': contentType } })) as unknown as typeof fetch;

describe('readResourceArticle', () => {
  it('returns the article text from an ordinary page', async () => {
    const result = await readResourceArticle('https://example.org/gospel', { fetchImpl: respond(articlePage), lookup });
    expect(result.readable).toBe(true);
    if (!result.readable) return;
    expect(result.html).toContain('the gospel is good news');
    expect(result.html).not.toContain('Donate');
    expect(result.wordCount).toBeGreaterThan(80);
  });

  it('answers unreadable, not an error, for a page that is not HTML', async () => {
    const result = await readResourceArticle('https://example.org/file', {
      fetchImpl: respond('%PDF-1.7', 'application/pdf'),
      lookup,
    });
    expect(result).toEqual({ readable: false, reason: 'not_html' });
  });

  it('answers unreadable for a teaser too short to be the article', async () => {
    const result = await readResourceArticle('https://example.org/paywalled', {
      fetchImpl: respond('<html><body><p>Subscribe to keep reading.</p></body></html>'),
      lookup,
    });
    expect(result).toEqual({ readable: false, reason: 'no_article' });
  });

  it('answers unreadable for a failed fetch', async () => {
    const result = await readResourceArticle('https://example.org/gone', {
      fetchImpl: respond('Not found', 'text/html', 404),
      lookup,
    });
    expect(result).toEqual({ readable: false, reason: 'fetch_failed' });
  });

  it('never fetches a private address', async () => {
    const fetchImpl = respond(articlePage);
    const result = await readResourceArticle('http://169.254.169.254/latest/meta-data/', { fetchImpl, lookup });
    expect(result).toEqual({ readable: false, reason: 'unsafe_url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
