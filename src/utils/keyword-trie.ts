/**
 * Trie-based word-bound keyword matching for book and character categories.
 * Used by bible-study-keywords to avoid O(n) regex scans over 400+ keywords.
 */

import type { BibleStudyKeyword } from './bible-study-keywords';
import { shouldSkipPersonNameContext } from './person-name-context';

export interface KeywordTrie {
  _root: TrieNode;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  /** Terminal: matches for this phrase (same phrase can map to multiple keywords, e.g. "Daniel" book vs character). */
  matches?: Array<{ keyword: BibleStudyKeyword; isSynonym: boolean }>;
}

const MAX_PHRASE_WORDS = 5;

/**
 * Build a trie from book and character keywords only. Call once and reuse.
 */
export function buildKeywordTrie(keywords: BibleStudyKeyword[]): KeywordTrie {
  const root: TrieNode = { children: new Map() };
  for (const keyword of keywords) {
    if (keyword.category !== 'book' && keyword.category !== 'character') continue;
    const mainPhrase = keyword.name.toLowerCase().trim();
    if (mainPhrase) insertPhrase(root, mainPhrase, keyword, false);
    for (const syn of keyword.synonyms) {
      const phrase = syn.toLowerCase().trim();
      if (phrase) insertPhrase(root, phrase, keyword, true);
    }
  }
  return { _root: root };
}

function insertPhrase(
  root: TrieNode,
  phrase: string,
  keyword: BibleStudyKeyword,
  isSynonym: boolean
): void {
  const words = phrase.split(/\s+/).filter(Boolean);
  let node = root;
  for (const word of words) {
    let next = node.children.get(word);
    if (!next) {
      next = { children: new Map() };
      node.children.set(word, next);
    }
    node = next;
  }
  if (!node.matches) node.matches = [];
  node.matches.push({ keyword, isSynonym });
}

/** Tokenize text into words (word-bound, lowercase). */
function tokenize(text: string): string[] {
  if (!text || !text.trim()) return [];
  return (text.toLowerCase().match(/\b[\w']+\b/g) ?? []);
}

export interface WordBoundMatchStats {
  confidence: number;
  inTitle: boolean;
  inContent: boolean;
  frequency: number;
}

/**
 * Find all word-bound keyword matches in title and content.
 * Returns a Map from keyword to aggregated stats (title boost and frequency boost applied by caller).
 */
export function findWordBoundMatches(
  trie: KeywordTrie,
  title: string,
  content: string
): Map<BibleStudyKeyword, WordBoundMatchStats> {
  const root = trie._root;
  const result = new Map<BibleStudyKeyword, WordBoundMatchStats>();

  function scanText(text: string, inTitle: boolean): void {
    const words = tokenize(text);
    for (let i = 0; i < words.length; i++) {
      for (let len = 1; len <= Math.min(MAX_PHRASE_WORDS, words.length - i); len++) {
        const phraseWords = words.slice(i, i + len);
        const stats = lookupPhrase(root, phraseWords);
        if (!stats) continue;
        if (!occurrenceIsValidForPersonContext(text, words, i, len, stats[0]!.keyword.category)) {
          continue;
        }
        for (const { keyword, isSynonym } of stats) {
          const conf = isSynonym ? keyword.confidence * 0.8 : keyword.confidence;
          const existing = result.get(keyword);
          if (!existing) {
            result.set(keyword, {
              confidence: conf,
              inTitle: inTitle,
              inContent: !inTitle,
              frequency: 1
            });
          } else {
            existing.frequency += 1;
            if (inTitle) existing.inTitle = true;
            else existing.inContent = true;
            existing.confidence = Math.max(existing.confidence, conf);
          }
        }
      }
    }
  }

  if (title?.trim()) scanText(title.trim(), true);
  if (content?.trim()) scanText(content.trim(), false);

  return result;
}

function escapeRegexToken(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when a trie hit at `wordIndex` should count (not a modern person-name mention). */
function occurrenceIsValidForPersonContext(
  text: string,
  words: string[],
  wordIndex: number,
  phraseLen: number,
  category: BibleStudyKeyword['category'],
): boolean {
  if (category !== 'character' && !(category === 'book' && phraseLen === 1)) {
    return true;
  }
  const phraseWords = words.slice(wordIndex, wordIndex + phraseLen);
  const pattern =
    phraseWords.length === 1
      ? `\\b${escapeRegexToken(phraseWords[0]!)}\\b`
      : `\\b${phraseWords.map(escapeRegexToken).join('\\s+')}\\b`;
  const re = new RegExp(pattern, 'giu');
  let seen = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const wordsBefore = tokenize(text.slice(0, start)).length;
    if (wordsBefore !== wordIndex) continue;
    seen += 1;
    if (seen > 1) return true;
    return !shouldSkipPersonNameContext(m[0], text, start, end);
  }
  return false;
}

function lookupPhrase(
  root: TrieNode,
  words: string[]
): Array<{ keyword: BibleStudyKeyword; isSynonym: boolean }> | null {
  let node: TrieNode | undefined = root;
  for (const word of words) {
    node = node?.children.get(word);
    if (!node) return null;
  }
  return node.matches ?? null;
}
