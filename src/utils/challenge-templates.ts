/**
 * The four paths a personal Challenge can take, and the steps each one lays out.
 *
 * A challenge is authored structure over the reader's own material: the template decides what
 * is asked and in what order, the reader's Thread or verse or question supplies what it is
 * asked about. Nothing here generates prose at runtime — the same reasoning as
 * `review-prompts.ts`, and the same consequence, that every step's wording can be read,
 * argued with, and edited by a person.
 *
 * Every step must leave the reader owning something afterwards: a note revised, a link made
 * with a reason attached, a tension named, a summary written. A step whose only outcome is
 * "you thought about it" is a step this file should not have.
 */

import {
  type ChallengeStepKind,
  type ChallengeStepStatus,
  type ChallengeTemplateKey,
} from './review-item-kinds';

export interface ChallengeStep {
  /** Stable within a challenge; the address the step-completion endpoint takes. */
  key: string;
  kind: ChallengeStepKind;
  title: string;
  prompt: string;
  status: ChallengeStepStatus;
  /** The note this step produced or revised, when it produced one. */
  artifactNoteId?: string;
  /** Short free text the reader left, for steps answered in place. */
  response?: string;
  completedAt?: string;
  /** `ladder` steps only — which rung of the verse ladder this step is. */
  ladderStep?: number;
}

export type ChallengeSource =
  | {
      kind: 'thread';
      repNoteId: string;
      threadTitle: string;
      memberNoteIds: string[];
      memberTitles: string[];
    }
  | {
      kind: 'verse';
      reference: string;
      translation?: string | null;
      entryId?: string | null;
    }
  | { kind: 'question'; noteId: string; title: string }
  | {
      kind: 'connection';
      fromNoteId: string;
      toNoteId: string;
      fromTitle: string;
      toTitle: string;
    };

/**
 * A question note is one whose title ends in a question mark.
 *
 * Deliberately the title and not the body: a note can ask a dozen questions in passing, but
 * titling it as a question is the reader declaring that the question is the point. Matching
 * body text would offer this challenge on almost every note anyone writes.
 */
export function isQuestionNoteTitle(title: string | null | undefined): boolean {
  return (title ?? '').trim().endsWith('?');
}

function step(
  key: string,
  kind: ChallengeStepKind,
  title: string,
  prompt: string,
  extra: Partial<ChallengeStep> = {},
): ChallengeStep {
  return { key, kind, title, prompt, status: 'pending', ...extra };
}

/**
 * "Strengthen this Thread" — the doc's worked example, verbatim in intent.
 *
 * Recall first, before anything is reopened, because the whole loop is retrieval before
 * reading. Then evidence, then a link, then the tension, then a summary addressed to the
 * reader's future self — which is the step that turns five answers into something worth
 * having later.
 */
function strengthenThreadSteps(source: Extract<ChallengeSource, { kind: 'thread' }>): ChallengeStep[] {
  const name = source.threadTitle.trim() || 'this';
  return [
    step(
      'recall-question',
      'recall',
      'Recall the question',
      `Before opening anything: what is the central question of your ${name} Thread?`,
    ),
    step(
      'add-evidence',
      'evidence',
      'Add the evidence',
      'Revisit one note in this Thread and add the detail in the text that supports what you wrote.',
    ),
    step(
      'link-passage',
      'link',
      'Link one more',
      'Link a related passage or note you have studied, and say in a sentence why it belongs here.',
    ),
    step(
      'name-tension',
      'tension',
      'Name what is unresolved',
      'What tension or uncertainty is still open in this Thread? Naming it is the work; resolving it is not required.',
    ),
    step(
      'write-summary',
      'summary',
      'Write it down for later',
      `In two or three sentences, what is your ${name} Thread saying? Write it for the version of you who comes back in a year.`,
    ),
  ];
}

/** "Keep this verse" — the ladder as a path, one rung per step. */
function keepVerseSteps(source: Extract<ChallengeSource, { kind: 'verse' }>): ChallengeStep[] {
  const ref = source.reference.trim();
  return [
    step('ladder-recognize', 'ladder', 'Recognize it', `Read ${ref} once, then continue it from its opening words.`, {
      ladderStep: 0,
    }),
    step('ladder-rebuild', 'ladder', 'Rebuild it', `Fill in what is missing from ${ref}.`, {
      ladderStep: 1,
    }),
    step('ladder-recall', 'ladder', 'Recall it', `Write ${ref} from memory, then compare.`, {
      ladderStep: 2,
    }),
    step('ladder-context', 'ladder', 'Place it', `What happens immediately before and after ${ref}?`, {
      ladderStep: 3,
    }),
    step('ladder-connect', 'ladder', 'Connect it', `What in your own study belongs alongside ${ref}, and why?`, {
      ladderStep: 4,
    }),
  ];
}

/** "Return to this question" — for a question note that has accumulated study since. */
function returnToQuestionSteps(source: Extract<ChallengeSource, { kind: 'question' }>): ChallengeStep[] {
  const title = source.title.trim();
  return [
    step(
      'recall-asking',
      'recall',
      'Recall the question',
      `You asked: ${title} Before reopening it, what did you already think the answer was?`,
    ),
    step(
      'what-changed',
      'evidence',
      'What has changed it',
      'Which note you have written since most changes how you approach this question? Add what it changed.',
    ),
    step(
      'still-open',
      'tension',
      'What is still open',
      'What part of this question is still unanswered? Keeping it open is a valid answer.',
    ),
    step(
      'update-question',
      'summary',
      'Say where it stands',
      'Update the question, or write where your thinking stands now. Either one is progress.',
    ),
  ];
}

/** "Trace a connection" — for a link the reader made but never explained. */
function traceConnectionSteps(source: Extract<ChallengeSource, { kind: 'connection' }>): ChallengeStep[] {
  const from = source.fromTitle.trim() || 'the first note';
  const to = source.toTitle.trim() || 'the second';
  return [
    step(
      'why-linked',
      'recall',
      'Why you linked them',
      `You connected ${from} and ${to}. Before opening either, why do they belong together?`,
    ),
    step(
      'evidence-both',
      'evidence',
      'Evidence from each',
      'What in each passage or note actually supports the connection? Add it where it is missing.',
    ),
    step(
      'what-is-distinct',
      'tension',
      'What is distinct',
      'Where do these two differ? A connection that flattens the difference is worth less than one that holds it.',
    ),
    step(
      'keep-or-revise',
      'summary',
      'Keep it or revise it',
      'State the connection in one sentence as you would now put it.',
    ),
  ];
}

export function buildChallengeSteps(
  templateKey: ChallengeTemplateKey,
  source: ChallengeSource,
): ChallengeStep[] {
  switch (templateKey) {
    case 'strengthen_thread':
      if (source.kind !== 'thread') throw new Error('strengthen_thread needs a Thread source');
      return strengthenThreadSteps(source);
    case 'keep_verse':
      if (source.kind !== 'verse') throw new Error('keep_verse needs a verse source');
      return keepVerseSteps(source);
    case 'return_to_question':
      if (source.kind !== 'question') throw new Error('return_to_question needs a question source');
      return returnToQuestionSteps(source);
    case 'trace_connection':
      if (source.kind !== 'connection') throw new Error('trace_connection needs a connection source');
      return traceConnectionSteps(source);
  }
}

export function challengeTitle(
  templateKey: ChallengeTemplateKey,
  source: ChallengeSource,
): string {
  switch (templateKey) {
    case 'strengthen_thread':
      return source.kind === 'thread'
        ? `Strengthen ${source.threadTitle.trim() || 'this Thread'}`
        : 'Strengthen this Thread';
    case 'keep_verse':
      return source.kind === 'verse' ? `Keep ${source.reference.trim()}` : 'Keep this verse';
    case 'return_to_question':
      return source.kind === 'question'
        ? `Return to: ${source.title.trim()}`
        : 'Return to this question';
    case 'trace_connection':
      return source.kind === 'connection'
        ? `Trace: ${source.fromTitle.trim() || 'a connection'}`
        : 'Trace a connection';
  }
}

/** `${templateKey}:${ids}` — one active challenge per template per source. */
export function challengeSourceKey(
  templateKey: ChallengeTemplateKey,
  source: ChallengeSource,
): string {
  switch (source.kind) {
    case 'thread':
      return `${templateKey}:${source.repNoteId}`;
    case 'verse':
      return `${templateKey}:${source.reference.trim().toLowerCase()}`;
    case 'question':
      return `${templateKey}:${source.noteId}`;
    case 'connection': {
      // Sorted, so linking A→B and B→A is one challenge rather than two.
      const [a, b] = [source.fromNoteId, source.toNoteId].sort();
      return `${templateKey}:${a}:${b}`;
    }
  }
}

export function applyStepOutcome(
  steps: ChallengeStep[],
  stepKey: string,
  status: Exclude<ChallengeStepStatus, 'pending'>,
  extra: { artifactNoteId?: string; response?: string; at?: Date } = {},
): ChallengeStep[] {
  const at = (extra.at ?? new Date()).toISOString();
  return steps.map((s) =>
    s.key === stepKey
      ? {
          ...s,
          status,
          completedAt: at,
          ...(extra.artifactNoteId ? { artifactNoteId: extra.artifactNoteId } : {}),
          ...(extra.response ? { response: extra.response } : {}),
        }
      : s,
  );
}

/** The first step still waiting, or the length when every step is resolved. */
export function nextPendingStepIndex(steps: ChallengeStep[]): number {
  const index = steps.findIndex((s) => s.status === 'pending');
  return index === -1 ? steps.length : index;
}

/**
 * Complete when nothing is pending — skipped counts.
 *
 * The alternative, requiring every step done, would mean a reader who skipped one step in
 * four could never finish and would carry an open challenge forever. That is the "failure
 * language" the doc rules out, expressed as state instead of copy.
 */
export function isChallengeComplete(steps: ChallengeStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.status !== 'pending');
}

export function countResolvedSteps(steps: ChallengeStep[]): number {
  return steps.filter((s) => s.status !== 'pending').length;
}

/** Parse the JSON column defensively — a malformed row should not take a page down. */
export function parseChallengeSteps(raw: string | null | undefined): ChallengeStep[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is ChallengeStep =>
        typeof s === 'object' && s !== null && typeof (s as ChallengeStep).key === 'string',
    );
  } catch {
    return [];
  }
}
