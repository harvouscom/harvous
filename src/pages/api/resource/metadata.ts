import type { APIRoute } from 'astro';
import { handleAPIError } from '@/utils/error-handling';
import { normalizeUrl } from '@/utils/validation';

// Helper function to decode HTML entities
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  
  return text.replace(/&[#\w]+;/g, (entity) => {
    return entities[entity] || entity;
  });
}

/**
 * Fetch Open Graph metadata from a URL
 * Supports both URL-only requests (manual input) and pre-fetched metadata (extension/share sheet)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    console.log('=== Metadata API called ===');
    const body = await request.json();
    console.log('Request body:', { url: body.url, hasMetadata: !!body.metadata });
    const { url, metadata } = body;

    // If metadata is provided directly (from extension/share sheet), return it
    if (metadata && typeof metadata === 'object') {
      return new Response(JSON.stringify({
        success: true,
        metadata: {
          title: metadata.title || metadata.ogTitle || '',
          description: metadata.description || metadata.ogDescription || '',
          image: metadata.image || metadata.ogImage || '',
          url: url || metadata.url || ''
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Otherwise, fetch metadata from URL
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({
        error: 'URL is required',
        code: 'MISSING_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Normalize URL by adding https:// if missing
    const normalizedUrl = normalizeUrl(url);

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return new Response(JSON.stringify({
        error: 'Invalid URL format',
        code: 'INVALID_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch the HTML content
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      // Timeout after 10 seconds
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: `Failed to fetch URL: ${response.statusText}`,
        code: 'FETCH_ERROR',
        status: response.status
      }), {
        status: response.status >= 500 ? 502 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const html = await response.text();
    console.log('Fetched HTML, length:', html.length);

    // More robust regex patterns that handle various quote styles and HTML formats
    // Handles: property="og:title" content="value", property='og:title' content='value', property=og:title content=value
    const ogTitlePattern = /<meta\s+(?:property|name)=["']?og:title["']?\s+content=["']([^"']+)["']/i;
    const ogDescriptionPattern = /<meta\s+(?:property|name)=["']?og:description["']?\s+content=["']([^"']+)["']/i;
    const ogImagePattern = /<meta\s+(?:property|name)=["']?og:image["']?\s+content=["']([^"']+)["']/i;
    
    // Also try with content before property/name
    const ogTitlePattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:title["']?/i;
    const ogDescriptionPattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:description["']?/i;
    const ogImagePattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:image["']?/i;

    // Parse Open Graph metadata - try both patterns
    const ogTitleMatch = html.match(ogTitlePattern) || html.match(ogTitlePattern2);
    const ogDescriptionMatch = html.match(ogDescriptionPattern) || html.match(ogDescriptionPattern2);
    const ogImageMatch = html.match(ogImagePattern) || html.match(ogImagePattern2);

    // Fallback to regular meta tags if OG tags not found
    const titleMatch = ogTitleMatch || html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descriptionMatch = ogDescriptionMatch || html.match(/<meta\s+name=["']?description["']?\s+content=["']([^"']+)["']/i) ||
                           html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']?description["']?/i);

    // Resolve relative image URLs
    let imageUrl = ogImageMatch ? ogImageMatch[1] : '';
    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, parsedUrl.origin).href;
      } catch {
        imageUrl = '';
      }
    }

    const extractedMetadata = {
      title: titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : '',
      description: descriptionMatch ? decodeHtmlEntities(descriptionMatch[1].trim()) : '',
      image: imageUrl,
      url: normalizedUrl
    };

    // Log for debugging (remove in production if needed)
    console.log('Metadata extracted:', {
      hasTitle: !!extractedMetadata.title,
      hasDescription: !!extractedMetadata.description,
      hasImage: !!extractedMetadata.image,
      url: normalizedUrl
    });

    return new Response(JSON.stringify({
      success: true,
      metadata: extractedMetadata
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/resource/metadata',
      action: 'fetch_resource_metadata'
    });

    // Handle timeout specifically
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return new Response(JSON.stringify({
        error: 'Request timeout - URL took too long to respond',
        code: 'TIMEOUT'
      }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
