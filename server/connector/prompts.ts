/**
 * Ready-made prompts — what a person sees in their assistant's "+" menu under Harvous.
 *
 * Each is a template that steers the assistant to the right read tools. They are only text:
 * no Plus check and no call against the daily limit; the tools they lead to are gated as usual.
 *
 * The copy is held to one stance, shared by every prompt: start from what the person wrote,
 * quote them, say whose words are whose, never present the assistant's reading as theirs, and
 * send them back to the passage itself. Harvous does not generate study content in the app,
 * and these prompts should not ask the assistant to stand in for the person's own reading.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

const STANCE = [
  'Start from what I have actually written, and quote my notes when you draw on them.',
  'Tell me which notes are mine and which came from someone else in a shared space.',
  "Don't present your own interpretation as mine; if you add something, say it's yours,",
  'and where Christians read a passage differently, say so rather than picking one.',
  "If I've written little or nothing, say so plainly rather than filling the gap.",
  'Give Scripture as references and point me back to the passage itself.',
].join(' ');

function message(text: string): GetPromptResult {
  return { messages: [{ role: 'user', content: { type: 'text', text: `${text}\n\n${STANCE}` } }] };
}

export const CONNECTOR_PROMPT_NAMES = ['study_passage', 'prepare_for_group', 'recent_study', 'trace_theme'] as const;

export function registerConnectorPrompts(server: McpServer): void {
  server.registerPrompt(
    'study_passage',
    {
      title: 'What have I studied on a passage?',
      description: 'Gather your notes and highlights on a Bible passage.',
      argsSchema: { passage: z.string().describe('A Bible reference, e.g. "Romans 8" or "John 3:16".') },
    },
    ({ passage }) =>
      message(
        `Using Harvous, show me what I've studied on ${passage}. Call find_by_passage for it, ` +
          'then read the notes that look most substantial with get_note. Summarize what I noticed, ' +
          'the questions I asked, and anything I highlighted, grouped by verse where that helps.',
      ),
  );

  server.registerPrompt(
    'prepare_for_group',
    {
      title: 'Prepare for my group',
      description: "Get ready for your study group from the space you share and your own notes.",
      argsSchema: {
        group: z.string().optional().describe('The name of the shared space, if you have more than one.'),
        passage_or_topic: z.string().optional().describe("This week's passage or topic, if you know it."),
      },
    },
    ({ group, passage_or_topic }) =>
      message(
        'Using Harvous, help me prepare for my study group' +
          (group ? ` ("${group}")` : '') +
          '. Find the shared space with list_spaces, look at its current thread with ' +
          'list_threads_in_space, and read recent notes there with list_notes_in_space. ' +
          (passage_or_topic
            ? `We're studying ${passage_or_topic}: use find_by_passage if it's a reference, otherwise search_notes, to bring in my own notes on it. `
            : '') +
          'Give me a short brief: where the group is, what I have already written that I could share, ' +
          'and two or three questions drawn from our notes to bring to the group. ' +
          "Don't evaluate or correct what others in the group wrote.",
      ),
  );

  server.registerPrompt(
    'recent_study',
    {
      title: 'Look back on my recent study',
      description: "A look back at what you've been writing lately.",
    },
    () =>
      message(
        "Using Harvous, look back on what I've been studying lately. Find my My Home space with " +
          'list_spaces, then list_notes_in_space for it — it is sorted by most recently edited. ' +
          'Read the most recent handful with get_note and tell me which passages and themes I keep ' +
          'returning to, and where I left off.',
      ),
  );

  server.registerPrompt(
    'trace_theme',
    {
      title: 'Trace a theme through my notes',
      description: 'Follow a theme across everything you have written.',
      argsSchema: { theme: z.string().describe('A word or idea, e.g. "grace" or "waiting".') },
    },
    ({ theme }) =>
      message(
        `Using Harvous, trace the theme "${theme}" through my notes. Run search_notes with the word ` +
          'and two or three close phrasings, read the strongest results with get_note, and use ' +
          'list_study_thread_connections on the most central note to see what I connected it to. ' +
          'Show how my thinking on it has developed, with the passages I tied it to.',
      ),
  );
}
