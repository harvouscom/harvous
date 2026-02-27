/**
 * Used only by the production API bundle (esbuild --loader:.md=text).
 * Do not import this in dev; server/routes/about.ts reads the .md from disk in dev.
 */
// @ts-expect-error - .md resolved by esbuild loader at build time
import founderLetterMarkdown from '@/data/about/founder-letter.md';
export default founderLetterMarkdown as string;
