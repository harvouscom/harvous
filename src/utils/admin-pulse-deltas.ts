export type RankItem = { name: string; count: number };

export type RankDelta = {
  name: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

/** Rank bar item with prior-period comparison for curiosity-style lists. */
export type ListedRankDelta = {
  name: string;
  count: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

/** Minimum prior-period count before % change is shown (avoids misleading spikes like +17 (1700%)). */
const RANK_DELTA_PCT_MIN_BASELINE = 5;
const RANK_DELTA_PCT_MAX = 300;

export function shouldShowRankDeltaPct(previous: number, deltaPct: number | null): boolean {
  if (deltaPct == null) return false;
  if (previous < RANK_DELTA_PCT_MIN_BASELINE) return false;
  if (Math.abs(deltaPct) > RANK_DELTA_PCT_MAX) return false;
  return true;
}

export function formatRankDeltaBadge(
  item: Pick<RankDelta, 'delta' | 'previous' | 'deltaPct'>,
  rising = true,
): string {
  const deltaText = rising ? `+${item.delta.toLocaleString()}` : item.delta.toLocaleString();
  if (!shouldShowRankDeltaPct(item.previous, item.deltaPct)) return deltaText;
  return `${deltaText} (${item.deltaPct}%)`;
}

function countMap(items: RankItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.name, item.count);
  }
  return map;
}

/** Attach prior-period counts and deltas to each current ranked item. */
export function attachRankDeltasToListedItems(
  current: RankItem[],
  previous: RankItem[],
): ListedRankDelta[] {
  const prevMap = countMap(previous);
  return current.map((item) => {
    const prev = prevMap.get(item.name) ?? 0;
    const delta = item.count - prev;
    return {
      name: item.name,
      count: item.count,
      previous: prev,
      delta,
      deltaPct: prev > 0 ? Math.round((delta / prev) * 100) : null,
    };
  });
}

/** Rank items by positive delta (current − previous), descending. */
export function computeRisingDeltas(
  current: RankItem[],
  previous: RankItem[],
  limit = 5,
): RankDelta[] {
  const prevMap = countMap(previous);
  const deltas: RankDelta[] = [];

  for (const item of current) {
    const prev = prevMap.get(item.name) ?? 0;
    const delta = item.count - prev;
    if (delta <= 0) continue;
    deltas.push({
      name: item.name,
      current: item.count,
      previous: prev,
      delta,
      deltaPct: prev > 0 ? Math.round((delta / prev) * 100) : null,
    });
  }

  return deltas
    .sort((a, b) => b.delta - a.delta || b.current - a.current || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Rank items by negative delta (cooling), most negative first. */
export function computeCoolingDeltas(
  current: RankItem[],
  previous: RankItem[],
  limit = 5,
): RankDelta[] {
  const currMap = countMap(current);
  const deltas: RankDelta[] = [];

  for (const item of previous) {
    const curr = currMap.get(item.name) ?? 0;
    const delta = curr - item.count;
    if (delta >= 0 || item.count === 0) continue;
    deltas.push({
      name: item.name,
      current: curr,
      previous: item.count,
      delta,
      deltaPct: item.count > 0 ? Math.round((delta / item.count) * 100) : null,
    });
  }

  return deltas
    .sort((a, b) => a.delta - b.delta || b.previous - a.previous || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export type PulseRightNowChipKind =
  | 'book'
  | 'passage'
  | 'theme'
  | 'delta'
  | 'metric'
  | 'translation'
  | 'canon'
  | 'tone'
  | 'folder'
  | 'dictionary'
  | 'thread';

export type PulseRightNowSegment =
  | { type: 'text'; value: string }
  | { type: 'chip'; label: string; kind: PulseRightNowChipKind };

export type PulseRightNowCanonSection = {
  label: string;
  count: number;
};

export type PulseRightNowThreadsSignal = {
  linksCreated: number;
  threadsLinkedInWindow: number;
  avgNotesPerThread: number;
  topThreadTheme: RankItem | null;
  recallImpressions: number;
};

export type PulseRightNowCopyInput = {
  days: number;
  risingBooks: RankDelta[];
  topPassage: RankItem | null;
  /** Ranked themes — the first entry is omitted (shown in the hero cards). */
  topThemes: RankItem[];
  topTranslation: RankItem | null;
  topCanonSection: PulseRightNowCanonSection | null;
  topTone: RankItem | null;
  topFolder: RankItem | null;
  topDictionaryWord: RankItem | null;
  /** Thread trends — total thread count is omitted (hero card). */
  threads: PulseRightNowThreadsSignal | null;
};

/** Flatten segments to plain text (for tests and snapshots). */
export function pulseRightNowSegmentsToText(segments: PulseRightNowSegment[]): string {
  return segments.map((segment) => (segment.type === 'text' ? segment.value : segment.label)).join('');
}

/** Flowing intro copy with inline chips for the Pulse "TLDR;" section. */
export function buildPulseRightNowCopy(input: PulseRightNowCopyInput): PulseRightNowSegment[] {
  const segments: PulseRightNowSegment[] = [];
  const windowLead = input.days === 7 ? 'This week' : `In the last ${input.days} days`;
  let hasClause = false;

  const pushText = (value: string) => {
    segments.push({ type: 'text', value });
  };

  const pushChip = (label: string, kind: PulseRightNowChipKind) => {
    segments.push({ type: 'chip', label, kind });
  };

  const startClause = () => {
    if (!hasClause) {
      pushText(`${windowLead}, `);
      hasClause = true;
      return;
    }
    pushText(', ');
  };

  const topRising = input.risingBooks[0];
  const topPassage = input.topPassage && input.topPassage.count > 0 ? input.topPassage : null;
  const themes = input.topThemes.slice(1, 4).filter((theme) => theme.name.trim());

  if (topRising) {
    startClause();
    pushChip(topRising.name, 'book');
    pushText(' leads study activity');
    if (shouldShowRankDeltaPct(topRising.previous, topRising.deltaPct)) {
      pushText(', up ');
      pushChip(`${topRising.deltaPct}%`, 'delta');
      pushText(' from the prior period');
    } else if (topRising.delta > 0) {
      pushText(', up from the prior period');
    }
  }

  if (topPassage) {
    startClause();
    pushText('with ');
    pushChip(topPassage.name, 'passage');
    pushText(' the most-saved passage');
  }

  if (themes.length > 0) {
    startClause();
    pushText(themes.length === 1 ? 'with theme ' : 'with themes like ');
    themes.forEach((theme, index) => {
      if (index > 0) {
        pushText(index === themes.length - 1 ? ', and ' : ', ');
      }
      pushChip(theme.name, 'theme');
    });
    pushText(' trending');
  }

  if (input.topCanonSection && input.topCanonSection.count > 0) {
    startClause();
    pushText('study clustered in the ');
    pushChip(input.topCanonSection.label, 'canon');
  }

  if (input.topTranslation && input.topTranslation.count > 0) {
    startClause();
    pushText('scripture mostly citing ');
    pushChip(input.topTranslation.name, 'translation');
  }

  if (input.topTone && input.topTone.count > 0) {
    startClause();
    pushText('notes reading ');
    pushChip(input.topTone.name.toLowerCase(), 'tone');
  }

  if (input.topFolder && input.topFolder.count > 0) {
    startClause();
    pushText('landing in ');
    pushChip(input.topFolder.name, 'folder');
  }

  if (input.topDictionaryWord && input.topDictionaryWord.count > 0) {
    startClause();
    pushText('and people pausing on ');
    pushChip(input.topDictionaryWord.name, 'dictionary');
  }

  const threads = input.threads;
  if (threads) {
    if (threads.linksCreated > 0) {
      startClause();
      pushText('with ');
      pushChip(String(threads.linksCreated), 'metric');
      const linkLabel = threads.linksCreated === 1 ? ' note link' : ' note links';
      if (threads.threadsLinkedInWindow > 0) {
        pushText(`${linkLabel} across `);
        pushChip(String(threads.threadsLinkedInWindow), 'thread');
        pushText(threads.threadsLinkedInWindow === 1 ? ' thread' : ' threads');
      } else {
        pushText(`${linkLabel} created`);
      }
    } else if (threads.avgNotesPerThread >= 2) {
      startClause();
      pushText('threads averaging ');
      pushChip(String(threads.avgNotesPerThread), 'thread');
      pushText(' notes each');
    }

    const threadTheme =
      threads.topThreadTheme && threads.topThreadTheme.count > 0 ? threads.topThreadTheme : null;
    const heroTheme = input.topThemes[0]?.name.trim().toLowerCase() ?? '';
    const threadThemeName = threadTheme?.name.trim() ?? '';
    if (threadTheme && threadThemeName && threadThemeName.toLowerCase() !== heroTheme) {
      startClause();
      pushText('connected threads exploring ');
      pushChip(threadThemeName, 'theme');
    }

    if (threads.recallImpressions > 0) {
      startClause();
      pushText('Home surfacing ');
      pushChip(String(threads.recallImpressions), 'metric');
      pushText(
        threads.recallImpressions === 1 ? ' thread suggestion' : ' thread suggestions',
      );
    }
  }

  if (segments.length === 0) {
    return segments;
  }

  pushText('.');
  return segments;
}
