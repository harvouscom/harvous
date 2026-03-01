/**
 * Founder letter content for the API. In production and dev we use the
 * generated file (from scripts/generate-founder-letter.js) so the content
 * is bundled into api.cjs and no runtime .md loader or dynamic import is needed.
 */
import founderLetterMarkdown from './founder-letter.inline.generated';
export default founderLetterMarkdown;
