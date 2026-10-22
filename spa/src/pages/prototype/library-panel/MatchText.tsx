/**
 * Text with its matched words marked — the amber underline the reader's own highlight draws.
 *
 * Takes runs rather than markup, so nothing reaches innerHTML: the verse search's server-marked
 * snippets (`splitVerseSnippet`) and the library's client-found matches (`splitQueryMatches`)
 * both arrive here as `{ text, match }` parts.
 */
import type { VerseSnippetPart } from '@/utils/verse-search-snippet';

export default function MatchText({ parts }: { parts: readonly VerseSnippetPart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="proto-verse-hit__match">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
