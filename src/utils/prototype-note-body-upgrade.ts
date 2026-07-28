import { isTiptapBodyEmpty } from './prototype-note-empty';

const PENDING_NOTE_ID_RE = /data-note-id\s*=\s*["']pending["']/i;

function hasScripturePills(html: string): boolean {
  return html.includes('data-scripture-reference');
}

function hasPendingScripturePills(html: string): boolean {
  return PENDING_NOTE_ID_RE.test(html);
}

/**
 * Whether prototype TipTap should accept a server body that arrived after first paint
 * (list preview→details, open-time scripture processing, unfocused realtime), when the
 * user has not typed this session.
 */
export function shouldUpgradePrototypeBodyFromServer(opts: {
  currentHtml: string;
  incomingHtml: string;
  /** List-seeded truncated body still marked preview. */
  contentIsPreview: boolean;
  /** This open started from a list preview seed. */
  seededFromPreview: boolean;
}): boolean {
  const current = opts.currentHtml ?? '';
  const incoming = opts.incomingHtml ?? '';
  if (isTiptapBodyEmpty(incoming)) return false;
  if (incoming === current) return false;

  const pendingCleared = hasPendingScripturePills(current) && !hasPendingScripturePills(incoming);
  if (!isTiptapBodyEmpty(current) && incoming.length < current.length && !pendingCleared) {
    return false;
  }

  if (opts.seededFromPreview) {
    const previewCleared = opts.contentIsPreview !== true;
    const materiallyLonger = !isTiptapBodyEmpty(current) && incoming.length > current.length;
    return previewCleared || materiallyLonger || pendingCleared;
  }

  // Details already loaded: allow scripture enrichment and other non-destructive growth.
  if (opts.contentIsPreview) return false;
  const gainedPills = !hasScripturePills(current) && hasScripturePills(incoming);
  const longer = incoming.length > current.length;
  return gainedPills || pendingCleared || longer;
}
