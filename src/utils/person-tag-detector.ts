/**
 * Detect person tags from patterns like "Pastor Tim" or "Ps Johnson".
 * Must not match book names like "Psalm 23".
 */

const PERSON_TAG_PATTERN = /\b(?:Pastor|Ps\.?)\s+([A-Z][\w'-]+)\b/g;

export function detectPersonTags(text: string): string[] {
  if (!text.trim()) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PERSON_TAG_PATTERN.source, PERSON_TAG_PATTERN.flags);
  while ((match = re.exec(text)) !== null) {
    const prefix = match[0].trim().split(/\s+/)[0].replace(/\.$/, '');
    const namePart = match[1].trim();
    if (!namePart) continue;
    const normalizedPrefix = prefix.toLowerCase() === 'pastor' ? 'Pastor' : 'Ps';
    const tag = `${normalizedPrefix} ${namePart}`;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}
