import type { APIRoute } from 'astro';
import { handleAPIError } from '@/utils/error-handling';
import { normalizeUrl } from '@/utils/validation';
import { extractArticleContent } from '@/utils/content-extractor';

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

// Helper function to clean SEO garbage from titles
function cleanTitle(title: string): string {
  if (!title) return '';
  
  let cleaned = title.trim();
  
  // Only remove common site name suffixes, NOT prefixes
  // Prefixes like "Dying is Hard | Pastor James..." are actual content, not SEO garbage
  // Common suffixes to remove: " - YouTube", " | Site Name", " — Company Name"
  
  // Count how many separators are in the title
  const separatorCount = (cleaned.match(/[\|–—]/g) || []).length;
  
  // Only clean suffix if there's exactly one separator (likely site name suffix)
  // If there are multiple separators, the title itself uses them (like sermon titles)
  if (separatorCount === 1) {
    // Suffix pattern: " | Site Name" or " - Site Name" at the end
    const suffixPattern = /\s*[\|–—\-]\s*[^|\-–—]+$/;
    const match = cleaned.match(suffixPattern);
    
    // Only remove if the suffix is relatively short (less than 30% of title)
    // and looks like a site name (typically short, no additional separators)
    if (match && match[0].length < cleaned.length * 0.3) {
      cleaned = cleaned.replace(suffixPattern, '').trim();
    }
  }
  
  // Special case: remove " - YouTube" suffix specifically (very common)
  cleaned = cleaned.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  
  return cleaned;
}

/**
 * Fetch Open Graph metadata from a URL
 * Supports both URL-only requests (manual input) and pre-fetched metadata (extension/share sheet)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    console.log('=== Metadata API called ===');
    const body = await request.json();
    console.log('Request body:', { url: body.url, hasMetadata: !!body.metadata, extractContent: body.extractContent });
    const { url, metadata, extractContent } = body;

    // If metadata is provided directly (from extension/share sheet), return it
    if (metadata && typeof metadata === 'object') {
      return new Response(JSON.stringify({
        success: true,
        metadata: {
          title: metadata.title || metadata.ogTitle || '',
          description: metadata.description || metadata.ogDescription || '',
          image: metadata.image || metadata.ogImage || '',
          url: url || metadata.url || '',
          siteName: metadata.siteName || metadata.ogSiteName || null
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
    const ogSiteNamePattern = /<meta\s+(?:property|name)=["']?og:site_name["']?\s+content=["']([^"']+)["']/i;
    
    // Also try with content before property/name
    const ogTitlePattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:title["']?/i;
    const ogDescriptionPattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:description["']?/i;
    const ogImagePattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:image["']?/i;
    const ogSiteNamePattern2 = /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']?og:site_name["']?/i;

    // Parse Open Graph metadata - try both patterns
    const ogTitleMatch = html.match(ogTitlePattern) || html.match(ogTitlePattern2);
    const ogDescriptionMatch = html.match(ogDescriptionPattern) || html.match(ogDescriptionPattern2);
    const ogImageMatch = html.match(ogImagePattern) || html.match(ogImagePattern2);
    const ogSiteNameMatch = html.match(ogSiteNamePattern) || html.match(ogSiteNamePattern2);

    // Extract actual page title and headings
    const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    // Match h1/h2 with potential nested tags, then strip HTML
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    
    // Helper to strip HTML tags from heading content
    const stripHtmlTags = (str: string) => str.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    
    // Check if this is a video platform (YouTube, Vimeo, etc.)
    const isVideoSite = parsedUrl.hostname.includes('youtube.com') || 
                        parsedUrl.hostname.includes('youtu.be') ||
                        parsedUrl.hostname.includes('vimeo.com');
    
    // Title priority depends on site type:
    // - Video sites: og:title is usually the clean video title
    // - Article sites: h1 > cleaned page title > h2 > og:title
    let bestTitle = '';
    
    if (isVideoSite) {
      // For video sites, prefer og:title (it's the actual video title)
      if (ogTitleMatch && ogTitleMatch[1].trim()) {
        bestTitle = cleanTitle(decodeHtmlEntities(ogTitleMatch[1].trim()));
      }
      if (!bestTitle && pageTitleMatch && pageTitleMatch[1].trim()) {
        bestTitle = cleanTitle(decodeHtmlEntities(pageTitleMatch[1].trim()));
      }
    } else {
      // For articles/other sites: h1 > cleaned page title > h2 > og:title
      // h1 is usually the actual article title without SEO garbage
      if (h1Match && h1Match[1]) {
        const h1Text = stripHtmlTags(h1Match[1]);
        if (h1Text) bestTitle = decodeHtmlEntities(h1Text);
      }
      if (!bestTitle && pageTitleMatch && pageTitleMatch[1].trim()) {
        bestTitle = cleanTitle(decodeHtmlEntities(pageTitleMatch[1].trim()));
      }
      if (!bestTitle && h2Match && h2Match[1]) {
        const h2Text = stripHtmlTags(h2Match[1]);
        if (h2Text) bestTitle = decodeHtmlEntities(h2Text);
      }
      if (!bestTitle && ogTitleMatch && ogTitleMatch[1].trim()) {
        bestTitle = cleanTitle(decodeHtmlEntities(ogTitleMatch[1].trim()));
      }
    }

    // Description: prefer og:description, fallback to meta description
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
      title: bestTitle,
      description: descriptionMatch ? decodeHtmlEntities(descriptionMatch[1].trim()) : '',
      image: imageUrl,
      url: normalizedUrl,
      siteName: ogSiteNameMatch ? decodeHtmlEntities(ogSiteNameMatch[1].trim()) : null
    };

    // Log for debugging
    console.log('Metadata extracted:', {
      title: extractedMetadata.title,
      isVideoSite,
      ogTitle: ogTitleMatch ? ogTitleMatch[1] : null,
      pageTitle: pageTitleMatch ? pageTitleMatch[1] : null,
      hasDescription: !!extractedMetadata.description,
      hasImage: !!extractedMetadata.image,
      siteName: extractedMetadata.siteName,
      url: normalizedUrl
    });

    // Extract article content if requested
    let articleContent: string | null = null;
    if (extractContent === true) {
      try {
        articleContent = extractArticleContent(html, normalizedUrl);
        console.log('Article content extracted:', articleContent ? `Length: ${articleContent.length}` : 'Failed');
      } catch (error) {
        console.error('Error extracting article content:', error);
        // Non-critical - continue without article content
      }
    }

    const responseMetadata: any = { ...extractedMetadata };
    if (articleContent !== null) {
      responseMetadata.articleContent = articleContent;
    }

    return new Response(JSON.stringify({
      success: true,
      metadata: responseMetadata
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
