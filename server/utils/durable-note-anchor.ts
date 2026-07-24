import { parseHTML } from 'linkedom';

export type DurableNoteAnchor = {
  quote: string;
  prefixContext: string;
  suffixContext: string;
  start: number | null;
  end: number | null;
};

export type DurableAnchorResolution =
  | {
      status: 'resolved';
      start: number;
      end: number;
      strategy: 'prior-range' | 'quote-context';
    }
  | {
      status: 'detached';
      start: null;
      end: null;
      strategy: null;
      reason: 'missing-quote' | 'ambiguous-quote' | 'context-mismatch';
    };

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]);

function appendBoundary(parts: string[]): void {
  if (parts.length > 0 && !parts.at(-1)!.endsWith('\n')) parts.push('\n');
}

function appendRenderedNode(node: any, parts: string[]): void {
  if (node.nodeType === 3) {
    const value = String(node.nodeValue ?? '');
    // Ignore serializer indentation between elements without collapsing authored spaces.
    if (/^[\t \r\n]+$/.test(value) && /[\r\n]/.test(value)) return;
    parts.push(value);
    return;
  }
  if (node.nodeType !== 1) return;

  const tag = String(node.localName ?? node.tagName ?? '').toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'template') return;
  if (tag === 'br' || tag === 'hr') {
    appendBoundary(parts);
    return;
  }

  const isBlock = BLOCK_TAGS.has(tag);
  if (isBlock) appendBoundary(parts);
  for (const child of Array.from(node.childNodes ?? [])) appendRenderedNode(child, parts);
  if (isBlock) appendBoundary(parts);
}

/**
 * Canonical TipTap HTML → rendered text coordinates used by every durable anchor.
 * Entity decoding comes from the HTML parser; blocks become single newlines, NBSP
 * and horizontal Unicode whitespace become spaces, line endings become LF, and
 * Unicode is normalized to NFC.
 */
function normalizeRenderedTextFragment(text: string): string {
  return text.replace(/\r\n?/g, '\n').normalize('NFC').replace(/[\p{Zs}\t\f\v]/gu, ' ');
}

export function tipTapHtmlToCanonicalText(content: string): string {
  if (!content) return '';
  const source = content.replace(/\r\n?/g, '\n');
  const { document } = parseHTML(`<html><body>${source}</body></html>`);
  const parts: string[] = [];
  for (const child of Array.from(document.body.childNodes)) appendRenderedNode(child, parts);

  return normalizeRenderedTextFragment(parts.join(''))
    .replace(/\n{2,}/g, '\n')
    .replace(/^\n+|\n+$/g, '');
}

export function createDurableNoteAnchorFromText(input: {
  text: string;
  start: number;
  end: number;
  contextLength?: number;
}): DurableNoteAnchor {
  const content = input.text;
  const { start, end } = input;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > content.length) {
    throw new RangeError('Anchor range must be a non-empty range within content');
  }

  const contextLength = Math.max(0, Math.floor(input.contextLength ?? 32));
  return {
    quote: content.slice(start, end),
    prefixContext: content.slice(Math.max(0, start - contextLength), start),
    suffixContext: content.slice(end, Math.min(content.length, end + contextLength)),
    start,
    end,
  };
}

export function createDurableNoteAnchorFromHtml(input: {
  html: string;
  start: number;
  end: number;
  contextLength?: number;
}): DurableNoteAnchor {
  return createDurableNoteAnchorFromText({
    text: tipTapHtmlToCanonicalText(input.html),
    start: input.start,
    end: input.end,
    contextLength: input.contextLength,
  });
}

function allQuoteStarts(content: string, quote: string): number[] {
  const starts: number[] = [];
  let fromIndex = 0;
  while (fromIndex <= content.length - quote.length) {
    const found = content.indexOf(quote, fromIndex);
    if (found < 0) break;
    starts.push(found);
    fromIndex = found + 1;
  }
  return starts;
}

/**
 * Deterministic re-anchoring:
 * 1. Keep the prior range only when it still contains the exact quote.
 * 2. Otherwise require exactly one occurrence matching both stored contexts.
 * 3. Missing, context-mismatched, or ambiguous matches detach. Never choose a nearest match.
 */
export function resolveDurableNoteAnchorInText(
  content: string,
  anchor: DurableNoteAnchor,
): DurableAnchorResolution {
  const { quote, prefixContext, suffixContext, start, end } = anchor;
  if (
    quote.length > 0 &&
    start != null &&
    end != null &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end === start + quote.length &&
    end <= content.length &&
    content.slice(start, end) === quote
  ) {
    return { status: 'resolved', start, end, strategy: 'prior-range' };
  }

  if (quote.length === 0) {
    return { status: 'detached', start: null, end: null, strategy: null, reason: 'missing-quote' };
  }

  const starts = allQuoteStarts(content, quote);
  if (starts.length === 0) {
    return { status: 'detached', start: null, end: null, strategy: null, reason: 'missing-quote' };
  }

  const matches = starts.filter((candidateStart) => {
    const candidateEnd = candidateStart + quote.length;
    const prefixMatches =
      prefixContext.length === 0 ||
      content.slice(Math.max(0, candidateStart - prefixContext.length), candidateStart) === prefixContext;
    const suffixMatches =
      suffixContext.length === 0 ||
      content.slice(candidateEnd, Math.min(content.length, candidateEnd + suffixContext.length)) === suffixContext;
    return prefixMatches && suffixMatches;
  });

  if (matches.length === 1) {
    const resolvedStart = matches[0]!;
    return {
      status: 'resolved',
      start: resolvedStart,
      end: resolvedStart + quote.length,
      strategy: 'quote-context',
    };
  }
  if (matches.length > 1) {
    return { status: 'detached', start: null, end: null, strategy: null, reason: 'ambiguous-quote' };
  }
  return { status: 'detached', start: null, end: null, strategy: null, reason: 'context-mismatch' };
}

export function resolveDurableNoteAnchorInHtml(
  html: string,
  anchor: DurableNoteAnchor,
): DurableAnchorResolution {
  return resolveDurableNoteAnchorInText(tipTapHtmlToCanonicalText(html), anchor);
}

/** Map a resolution to the additive StudyThreadEntries persistence fields. */
export function durableAnchorResolutionPatch(resolution: DurableAnchorResolution, now: Date) {
  if (resolution.status === 'resolved') {
    return {
      anchorStatus: 'resolved' as const,
      resolvedAnchorStart: resolution.start,
      resolvedAnchorEnd: resolution.end,
      anchorResolvedAt: now,
      anchorDetachedAt: null,
    };
  }
  return {
    anchorStatus: 'detached' as const,
    resolvedAnchorStart: null,
    resolvedAnchorEnd: null,
    anchorResolvedAt: null,
    anchorDetachedAt: now,
  };
}

export type DurableAnchorReresolutionRow = {
  anchorQuote: string | null;
  anchorPrefixContext: string | null;
  anchorSuffixContext: string | null;
  resolvedAnchorStart: number | null;
  resolvedAnchorEnd: number | null;
};

/**
 * Re-resolve an immutable selector against a new canonical version. The
 * original noteVersionId/quote/context are never rewritten.
 */
export function buildDurableAnchorReresolutionPatch(input: {
  row: DurableAnchorReresolutionRow;
  html: string;
  resolvedVersionId: string;
  now: Date;
}) {
  if (!input.row.anchorQuote) {
    return {
      resolvedVersionId: input.resolvedVersionId,
      anchorStatus: 'orphaned' as const,
      resolvedAnchorStart: null,
      resolvedAnchorEnd: null,
      anchorResolvedAt: null,
      anchorDetachedAt: input.now,
    };
  }
  const resolution = resolveDurableNoteAnchorInHtml(input.html, {
    quote: input.row.anchorQuote,
    prefixContext: input.row.anchorPrefixContext ?? '',
    suffixContext: input.row.anchorSuffixContext ?? '',
    start: input.row.resolvedAnchorStart,
    end: input.row.resolvedAnchorEnd,
  });
  return {
    resolvedVersionId: input.resolvedVersionId,
    ...durableAnchorResolutionPatch(resolution, input.now),
  };
}

export type LegacyAnchorMigrationInput = {
  baselineVersionId: string;
  baselineContent: string;
  anchorLocation: number | null;
  anchorLength: number | null;
  anchorTextSnapshot: string | null;
  sourceSnippet: string | null;
  migratedAt: Date;
  contextLength?: number;
};

export type LegacyAnchorMigrationPatch = {
  noteVersionId: string;
  anchorQuote: string | null;
  anchorPrefixContext: string | null;
  anchorSuffixContext: string | null;
  anchorStatus: 'resolved' | 'detached' | 'orphaned';
  resolvedAnchorStart: number | null;
  resolvedAnchorEnd: number | null;
  anchorResolvedAt: Date | null;
  anchorDetachedAt: Date | null;
};

export type LegacyAnchorMigrationState = {
  noteVersionId: string | null;
  anchorStatus: string;
  anchorLocation: number | null;
  anchorLength: number | null;
  anchorTextSnapshot: string | null;
  sourceSnippet: string;
  updatedAt: Date | null;
};

export function legacyAnchorMigrationStateMatches(
  expected: LegacyAnchorMigrationState,
  actual: LegacyAnchorMigrationState,
): boolean {
  return (
    expected.noteVersionId === actual.noteVersionId &&
    expected.anchorStatus === actual.anchorStatus &&
    expected.anchorLocation === actual.anchorLocation &&
    expected.anchorLength === actual.anchorLength &&
    expected.anchorTextSnapshot === actual.anchorTextSnapshot &&
    expected.sourceSnippet === actual.sourceSnippet &&
    expected.updatedAt?.getTime() === actual.updatedAt?.getTime()
  );
}

/** Pure migration policy for additive legacy StudyThreadEntries anchor fields. */
export function buildLegacyAnchorMigrationPatch(input: LegacyAnchorMigrationInput): LegacyAnchorMigrationPatch {
  const content = tipTapHtmlToCanonicalText(input.baselineContent);
  const rawQuote =
    input.anchorTextSnapshot && input.anchorTextSnapshot.trim()
      ? input.anchorTextSnapshot
      : input.sourceSnippet && input.sourceSnippet.trim()
        ? input.sourceSnippet
        : '';
  let quote = normalizeRenderedTextFragment(rawQuote);
  const validRange =
    input.anchorLocation != null &&
    input.anchorLength != null &&
    Number.isInteger(input.anchorLocation) &&
    Number.isInteger(input.anchorLength) &&
    input.anchorLocation >= 0 &&
    input.anchorLength > 0 &&
    input.anchorLocation + input.anchorLength <= content.length;

  if (!quote && validRange) {
    quote = content.slice(input.anchorLocation!, input.anchorLocation! + input.anchorLength!);
  }
  if (!quote) {
    return {
      noteVersionId: input.baselineVersionId,
      anchorQuote: null,
      anchorPrefixContext: null,
      anchorSuffixContext: null,
      anchorStatus: 'orphaned',
      resolvedAnchorStart: null,
      resolvedAnchorEnd: null,
      anchorResolvedAt: null,
      anchorDetachedAt: input.migratedAt,
    };
  }

  const resolution = resolveDurableNoteAnchorInText(content, {
    quote,
    prefixContext: '',
    suffixContext: '',
    start: validRange ? input.anchorLocation : null,
    end: validRange ? input.anchorLocation! + input.anchorLength! : null,
  });
  if (resolution.status === 'detached') {
    return {
      noteVersionId: input.baselineVersionId,
      anchorQuote: quote,
      anchorPrefixContext: null,
      anchorSuffixContext: null,
      anchorStatus: 'detached',
      resolvedAnchorStart: null,
      resolvedAnchorEnd: null,
      anchorResolvedAt: null,
      anchorDetachedAt: input.migratedAt,
    };
  }

  const selector = createDurableNoteAnchorFromText({
    text: content,
    start: resolution.start,
    end: resolution.end,
    contextLength: input.contextLength,
  });
  return {
    noteVersionId: input.baselineVersionId,
    anchorQuote: selector.quote,
    anchorPrefixContext: selector.prefixContext,
    anchorSuffixContext: selector.suffixContext,
    anchorStatus: 'resolved',
    resolvedAnchorStart: selector.start,
    resolvedAnchorEnd: selector.end,
    anchorResolvedAt: input.migratedAt,
    anchorDetachedAt: null,
  };
}

export type DurableAnchorRowForVerification = {
  parentNoteId: string;
  noteVersionId: string | null;
  resolvedVersionId?: string | null;
  anchorQuote: string | null;
  anchorPrefixContext: string | null;
  anchorSuffixContext: string | null;
  anchorStatus: string;
  resolvedAnchorStart: number | null;
  resolvedAnchorEnd: number | null;
  anchorResolvedAt: Date | null;
  anchorDetachedAt: Date | null;
};

export function durableAnchorValidityReason(
  row: DurableAnchorRowForVerification,
  version: { id: string; noteId: string; content: string } | null,
): string | null {
  const effectiveResolvedVersionId = row.resolvedVersionId ?? row.noteVersionId;
  if (!version || effectiveResolvedVersionId !== version.id || version.noteId !== row.parentNoteId) {
    return 'invalid-version-binding';
  }
  if (row.anchorStatus === 'resolved') {
    if (
      !row.anchorQuote ||
      row.resolvedAnchorStart == null ||
      row.resolvedAnchorEnd == null ||
      !row.anchorResolvedAt ||
      row.anchorDetachedAt
    ) {
      return 'incomplete-resolved-anchor';
    }
    const resolution = resolveDurableNoteAnchorInHtml(version.content, {
      quote: row.anchorQuote,
      prefixContext: row.anchorPrefixContext ?? '',
      suffixContext: row.anchorSuffixContext ?? '',
      start: row.resolvedAnchorStart,
      end: row.resolvedAnchorEnd,
    });
    return resolution.status === 'resolved' && resolution.start === row.resolvedAnchorStart ? null : 'stale-resolved-anchor';
  }
  if (row.anchorStatus === 'detached') {
    const structurallyValid =
      row.anchorQuote &&
      row.resolvedAnchorStart == null &&
      row.resolvedAnchorEnd == null &&
      !row.anchorResolvedAt &&
      row.anchorDetachedAt;
    if (!structurallyValid) return 'invalid-detached-anchor';
    const resolution = resolveDurableNoteAnchorInHtml(version.content, {
      quote: row.anchorQuote!,
      prefixContext: row.anchorPrefixContext ?? '',
      suffixContext: row.anchorSuffixContext ?? '',
      start: null,
      end: null,
    });
    return resolution.status === 'detached' ? null : 'detached-anchor-resolves';
  }
  if (row.anchorStatus === 'orphaned') {
    return !row.anchorQuote &&
      row.resolvedAnchorStart == null &&
      row.resolvedAnchorEnd == null &&
      !row.anchorResolvedAt &&
      row.anchorDetachedAt
      ? null
      : 'invalid-orphaned-anchor';
  }
  return 'unprocessed-anchor';
}
