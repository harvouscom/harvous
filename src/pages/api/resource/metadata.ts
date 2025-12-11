import type { APIRoute } from 'astro';
import { handleAPIError } from '@/utils/error-handling';
import { normalizeUrl, validateResourceUrl, getDomainFriendlyName, extractDomain } from '@/utils/validation';
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

// Helper function to check if an image URL looks like a generic site-wide image
function isGenericImage(imageUrl: string): boolean {
  if (!imageUrl) return true;
  
  const lowerUrl = imageUrl.toLowerCase();
  
  // Patterns that indicate generic/site-wide images
  const genericPatterns = [
    'logo', 'default', 'banner', 'header', 'og-image', 'ogimage',
    'social-share', 'share-image', 'site-image', 'favicon',
    'placeholder', 'thumbnail-default', 'brand', 'icon',
    // Additional patterns for social sharing
    '/social/', '/og/', '/share/', '/opengraph/',
    'social-media', 'meta-image', 'featured-default',
    // Common CMS patterns
    '/static/images/', '/assets/images/social',
    // Standard og:image dimensions in filename
    '1200x630', '1200x600', '1200x628', '600x315',
    // Generic filenames
    'twitter-card', 'facebook-share', 'linkedin-share'
  ];
  
  // Check if URL contains generic patterns
  if (genericPatterns.some(pattern => lowerUrl.includes(pattern))) {
    return true;
  }
  
  // Check for very short filenames that are likely generic (e.g., "og.png", "share.jpg")
  const filename = lowerUrl.split('/').pop()?.split('?')[0] || '';
  if (filename.length < 10 && !filename.includes('-') && !filename.includes('_')) {
    return true;
  }
  
  // Check if the image is likely a site-wide default (same image used everywhere)
  // These often have very generic paths
  const pathParts = lowerUrl.split('/');
  const hasContentSpecificPath = pathParts.some(part => 
    /^\d{4}$/.test(part) || // Year in path (like /2024/)
    /^[a-z]+-[a-z]+-[a-z]+/.test(part) || // Slug-like paths
    part.includes('article') ||
    part.includes('post') ||
    part.includes('guide')
  );
  
  // If the path doesn't look content-specific AND it's in a static/assets folder, it's likely generic
  if (!hasContentSpecificPath && (lowerUrl.includes('/static/') || lowerUrl.includes('/assets/'))) {
    return true;
  }
  
  return false;
}

// Helper function to extract first meaningful content image from HTML
function extractFirstContentImage(html: string, baseUrl: string): string | null {
  // Look for images in likely content areas
  // Priority: images after h1, images in article/main tags, then any large image
  
  // Pattern to find img tags with src attribute
  const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const images: string[] = [];
  let match;
  
  while ((match = imgPattern.exec(html)) !== null) {
    const src = match[1];
    const fullMatch = match[0].toLowerCase();
    
    // Skip tiny images, icons, avatars, tracking pixels
    if (
      fullMatch.includes('width="1"') ||
      fullMatch.includes("width='1'") ||
      fullMatch.includes('height="1"') ||
      fullMatch.includes("height='1'") ||
      fullMatch.includes('icon') ||
      fullMatch.includes('avatar') ||
      fullMatch.includes('emoji') ||
      fullMatch.includes('pixel') ||
      fullMatch.includes('tracking') ||
      fullMatch.includes('spacer') ||
      fullMatch.includes('badge') ||
      src.includes('data:image') ||
      src.includes('.svg') ||
      src.includes('gravatar')
    ) {
      continue;
    }
    
    // Skip images that look like logos or generic site images
    if (isGenericImage(src)) {
      continue;
    }
    
    images.push(src);
  }
  
  // Return first valid image found
  if (images.length > 0) {
    let imageUrl = images[0];
    
    // Resolve relative URLs
    if (!imageUrl.startsWith('http')) {
      try {
        imageUrl = new URL(imageUrl, baseUrl).href;
      } catch {
        return null;
      }
    }
    
    return imageUrl;
  }
  
  return null;
}

// Helper function to extract site name from title suffix
// Extracts patterns like "Article Title | SiteName" or "Article Title - SiteName"
function extractSiteNameFromTitle(title: string): string | null {
  if (!title) return null;
  
  const trimmed = title.trim();
  const separators = /\s*[\|–—\-·]\s*/;
  const parts = trimmed.split(separators);
  
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1].trim();
    // Only use if it's short (under 30 chars) and looks like a site name
    if (lastPart.length > 0 && lastPart.length < 30) {
      return lastPart;
    }
  }
  
  return null;
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
    const body = await request.json();
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

    // Validate URL with comprehensive security checks
    const urlValidation = validateResourceUrl(url);
    if (!urlValidation.isValid) {
      return new Response(JSON.stringify({
        error: urlValidation.error || 'Invalid URL',
        code: urlValidation.code || 'INVALID_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedUrl = urlValidation.normalizedUrl!;
    const isPDF = urlValidation.isPDF || false;

    // Parse URL for domain extraction
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

    // Handle PDF URLs specially - no HTML fetch needed
    if (isPDF) {
      // Extract filename from URL for title
      const urlPath = parsedUrl.pathname;
      let filename = 'PDF Document';
      
      // Get the last segment of the path
      const lastSegment = urlPath.split('/').filter(Boolean).pop();
      if (lastSegment) {
        // Decode URL encoding, remove .pdf extension (case-insensitive), replace dashes/underscores with spaces
        filename = decodeURIComponent(lastSegment)
          .replace(/\.pdf$/i, '')  // Case-insensitive, only at end
          .replace(/[-_]/g, ' ')
          .trim();
        
        // Capitalize first letter of each word for cleaner display
        if (filename) {
          filename = filename
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        }
      }
      
      // Fallback if filename is still empty
      if (!filename) {
        filename = 'PDF Document';
      }
      
      return new Response(JSON.stringify({
        success: true,
        metadata: {
          title: filename,
          description: 'PDF Document',
          image: '', // No image for PDFs
          url: normalizedUrl,
          siteName: parsedUrl.hostname.replace('www.', ''),
          contentType: 'pdf'
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch the HTML content for non-PDF URLs
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

    // Image selection strategy:
    // 1. First, try to find a good content image from the page (more likely to be content-specific)
    // 2. Fall back to og:image only if no content image found
    // 3. This ensures we get content-specific images instead of generic site banners
    
    let imageUrl = '';
    
    // Try content image first
    const contentImage = extractFirstContentImage(html, parsedUrl.origin);
    if (contentImage) {
      imageUrl = contentImage;
    }
    
    // Fall back to og:image if no content image found
    if (!imageUrl && ogImageMatch) {
      imageUrl = ogImageMatch[1];
      if (imageUrl && !imageUrl.startsWith('http')) {
        try {
          imageUrl = new URL(imageUrl, parsedUrl.origin).href;
        } catch {
          imageUrl = '';
        }
      }
    }

    // Get siteName with fallback chain:
    // 1. og:site_name from metadata
    // 2. Extracted from title suffix
    // 3. Friendly domain name from mapping
    // 4. Formatted domain (remove .com/.org, capitalize)
    let siteName: string | null = ogSiteNameMatch ? decodeHtmlEntities(ogSiteNameMatch[1].trim()) : null;
    
    if (!siteName && bestTitle) {
      // Try extracting from title suffix
      siteName = extractSiteNameFromTitle(bestTitle);
    }
    
    if (!siteName) {
      const domain = extractDomain(normalizedUrl);
      if (domain) {
        const friendlyName = getDomainFriendlyName(domain);
        // Only use friendly name if it's different from the raw domain
        if (friendlyName && friendlyName !== domain) {
          siteName = friendlyName;
        } else {
          // Format domain: remove .com/.org, capitalize
          const formatted = domain
            .replace(/\.(com|org|net|io|co|edu|gov)$/i, '')
            .split(/[.\-]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
          siteName = formatted;
        }
      }
    }

    const extractedMetadata = {
      title: bestTitle,
      description: descriptionMatch ? decodeHtmlEntities(descriptionMatch[1].trim()) : '',
      image: imageUrl,
      url: normalizedUrl,
      siteName
    };

    // Extract article content if requested
    let articleContent: string | null = null;
    if (extractContent === true) {
      try {
        articleContent = extractArticleContent(html, normalizedUrl);
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
