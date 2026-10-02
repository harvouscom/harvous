/**
 * The Connector's MCP tools. The only module here that knows about MCP.
 *
 * Each tool: Zod input shape (the published schema *is* the validator) → `beforeCall`
 * (access, disconnected-app check, rate limits) → `connectorReadService` → result.
 * A `ConnectorRefusal` becomes a normal tool result with `isError: true` and readable text —
 * the assistant can relay it. Anything else is a real failure and is logged.
 *
 * Read-only, plus one create (docs/future/CONNECTOR_BOUNDARIES.md): every tool but
 * `start_note` is annotated read-only, and tools-contract.test.ts fails if any other tool
 * appears without the hint. `start_note` starts a new, empty note and can't name an existing one.
 *
 * Descriptions lead with the words people actually use ("what did I write about…", "where was
 * I", "start a note in Harvous"): an assistant picks a tool by matching those, so the wording is
 * the routing. tools-contract.test.ts pins the key phrases.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { PAGE_MAX, SPACES_PAGE_MAX } from './config';
import * as reads from './read-service';
import { MAX_PASSAGES, startNote } from './write-service';
import { ConnectorRefusal, type NoteDetail } from './shapes';

export interface ToolContext {
  userId: string;
  /** The calling app (OAuth client id, or `token:<id>`). Names the app on a started note. */
  clientId: string;
  /** Runs before every tool call; throws `ConnectorRefusal` to refuse it. */
  beforeCall: (tool: string) => Promise<void>;
  /** Runs after every tool call, for the one-line call log. */
  afterCall?: (tool: string, outcome: string, ms: number) => void;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/** `start_note`: a create — not read-only, so apps ask before each call — never destructive. */
const CREATES_A_NOTE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const CONNECTOR_TOOL_NAMES = [
  'search_notes',
  'get_note',
  'list_spaces',
  'list_threads_in_space',
  'list_notes_in_space',
  'list_study_thread_connections',
  'get_shared_note',
  'find_by_passage',
  'search',
  'fetch',
  'where_i_left_off',
  'list_notes_in_thread',
  'passage_context',
  'start_note',
] as const;

const cursor = z.string().max(512).optional().describe('From a previous result’s nextCursor, to get the next page.');
const limit = (max: number, fallback: number) =>
  z.number().int().min(1).max(max).default(fallback).describe(`How many to return (1–${max}).`);
const id = (what: string) => z.string().trim().min(1).max(128).describe(what);

function json(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

/** Notes read best as Markdown with a short header; the full object rides in structuredContent. */
function noteResult(note: NoteDetail): CallToolResult {
  let text: string;
  if (note.locked) {
    text = `# ${note.title}\n\n_${note.message}_`;
  } else {
    const meta = [
      `id: ${note.id}`,
      note.byYou ? 'author: you' : 'author: another member of this space',
      note.space ? `space: ${note.space.title}` : null,
      note.folder ? `folder: ${note.folder}` : null,
      note.tags?.length ? `tags: ${note.tags.join(', ')}` : null,
      note.scriptureReferences.length ? `scripture: ${note.scriptureReferences.join('; ')}` : null,
      note.scripture?.reference ? `scripture: ${note.scripture.reference}` : null,
      note.updatedAt ? `updated: ${note.updatedAt}` : null,
    ].filter(Boolean);
    const body = note.bodyMarkdown ?? '_This is a passage of Scripture saved as a note; only its reference is shared._';
    const highlights = note.highlights?.length
      ? '\n\n## Highlights\n' +
        note.highlights.map((h) => `- ${h.text ? `"${h.text}"` : ''}${h.note ? ` — ${h.note}` : ''}`).join('\n')
      : '';
    text = `# ${note.title}\n${meta.join('\n')}\n\n${body}${note.truncated ? '\n\n_(truncated)_' : ''}${highlights}`;
  }
  return { content: [{ type: 'text', text }], structuredContent: note as unknown as Record<string, unknown> };
}

function refusal(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function run(
  ctx: ToolContext,
  tool: string,
  body: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const started = Date.now();
  try {
    await ctx.beforeCall(tool);
    const result = await body();
    ctx.afterCall?.(tool, 'ok', Date.now() - started);
    return result;
  } catch (error) {
    if (error instanceof ConnectorRefusal) {
      ctx.afterCall?.(tool, error.code, Date.now() - started);
      return refusal(error.message);
    }
    ctx.afterCall?.(tool, 'error', Date.now() - started);
    console.error(`[connector] ${tool} failed:`, error);
    return refusal('Harvous could not complete that request. Try again in a moment.');
  }
}

export function registerConnectorTools(server: McpServer, ctx: ToolContext): void {
  const { userId } = ctx;

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description:
        'When they ask "what did I write about…", "find my notes on grace", or "what have I learned ' +
        'about prayer": full-text search across the notes this person wrote (titles, bodies, tags, ' +
        'scripture references). Optionally limit to one space. Returns short snippets; use get_note for the full text.',
      inputSchema: {
        query: z.string().trim().min(MIN_SEARCH_QUERY_LENGTH).max(200).describe('Words or a reference to look for, e.g. "grace" or "Romans 8".'),
        spaceId: id('Only search this space (from list_spaces).').optional(),
        limit: limit(PAGE_MAX, 10),
        cursor,
      },
      annotations: { title: 'Search notes', ...READ_ONLY },
    },
    (args) => run(ctx, 'search_notes', async () => json(await reads.searchNotes(userId, args))),
  );

  server.registerTool(
    'get_note',
    {
      title: 'Read a note',
      description:
        'The full text of one note as Markdown, with its scripture references, folder, tags and ' +
        'highlights. A locked note returns only its title and dates.',
      inputSchema: {
        noteId: id('The note id, from search or a list.'),
        spaceId: id('The shared space the note was found in, if any.').optional(),
      },
      annotations: { title: 'Read a note', ...READ_ONLY },
    },
    (args) => run(ctx, 'get_note', async () => noteResult(await reads.getNote(userId, args))),
  );

  server.registerTool(
    'list_spaces',
    {
      title: 'List spaces',
      description:
        'The spaces this person owns or belongs to — their personal "My Home", and shared study ' +
        'spaces. Use a space id to list its threads or notes.',
      inputSchema: { limit: limit(SPACES_PAGE_MAX, 25), cursor },
      annotations: { title: 'List spaces', ...READ_ONLY },
    },
    (args) => run(ctx, 'list_spaces', async () => json(await reads.listSpaces(userId, args))),
  );

  server.registerTool(
    'list_threads_in_space',
    {
      title: 'List threads in a space',
      description: 'The threads (series or topics) in one space, with how many notes each holds.',
      inputSchema: { spaceId: id('The space id, from list_spaces.'), limit: limit(PAGE_MAX, 25), cursor },
      annotations: { title: 'List threads in a space', ...READ_ONLY },
    },
    (args) => run(ctx, 'list_threads_in_space', async () => json(await reads.listThreadsInSpace(userId, args))),
  );

  server.registerTool(
    'list_notes_in_space',
    {
      title: 'List notes in a space',
      description: 'Notes in one space, most recently edited first, with a short snippet of each.',
      inputSchema: { spaceId: id('The space id, from list_spaces.'), limit: limit(PAGE_MAX, 20), cursor },
      annotations: { title: 'List notes in a space', ...READ_ONLY },
    },
    (args) => run(ctx, 'list_notes_in_space', async () => json(await reads.listNotesInSpace(userId, args))),
  );

  server.registerTool(
    'list_study_thread_connections',
    {
      title: 'Connected notes',
      description:
        'The connections this person drew between notes (Harvous calls a connected group a ' +
        'Thread). Pass noteId for the notes connected to one note, or spaceId for every Thread in a space.',
      inputSchema: {
        noteId: id('A note id: return the notes connected to it.').optional(),
        spaceId: id('A space id: return its Threads of connected notes.').optional(),
        limit: limit(PAGE_MAX, 25),
        cursor,
      },
      annotations: { title: 'Connected notes', ...READ_ONLY },
    },
    (args) =>
      run(ctx, 'list_study_thread_connections', async () =>
        json(await reads.listStudyThreadConnections(userId, args)),
      ),
  );

  server.registerTool(
    'get_shared_note',
    {
      title: 'Read a shared link',
      description: 'Read a note someone shared publicly, from its Harvous share link or token.',
      inputSchema: {
        shareToken: z.string().trim().min(1).max(512).describe('A Harvous share link (…/shared/note/…) or its token.'),
      },
      annotations: { title: 'Read a shared link', ...READ_ONLY },
    },
    (args) => run(ctx, 'get_shared_note', async () => noteResult(await reads.getSharedNote(userId, args))),
  );

  server.registerTool(
    'find_by_passage',
    {
      title: 'Find by passage',
      description:
        'When they mention a book, chapter or verse ("Romans 8", "John 3:16", "my study on Exodus"): ' +
        'everything this person has written or highlighted on that passage — their notes that cite ' +
        'it (ranges understood — "Romans 8" finds a note on Romans 8:28–30) and their highlights and ' +
        'annotations from reading it. Use this, not search_notes, whenever they name a passage. ' +
        'Returns references and their own words only, never verse text.',
      inputSchema: {
        passage: z.string().trim().min(2).max(120).describe('A Bible reference, e.g. "Romans 8", "John 3:16" or "Exodus 6:28–7:7".'),
        limit: limit(PAGE_MAX, 10),
        cursor,
      },
      annotations: { title: 'Find by passage', ...READ_ONLY },
    },
    (args) => run(ctx, 'find_by_passage', async () => json(await reads.findByPassage(userId, args))),
  );

  // ChatGPT's deep research and company-knowledge modes use only these two names and shapes
  // (https://developers.openai.com/api/docs/mcp). Thin adapters over the tools above.
  server.registerTool(
    'search',
    {
      title: 'Search Harvous',
      description:
        "Search this person's Harvous Bible study notes. A Bible reference (\"Romans 8\") finds notes " +
        'citing that passage; anything else is a full-text search. Returns ids to pass to fetch.',
      inputSchema: {
        query: z.string().trim().min(2).max(200).describe('Words, a theme, or a Bible reference.'),
      },
      annotations: { title: 'Search Harvous', ...READ_ONLY },
    },
    (args) => run(ctx, 'search', async () => json(await reads.searchForResearch(userId, args.query))),
  );

  server.registerTool(
    'fetch',
    {
      title: 'Fetch a Harvous note',
      description: 'The full text of one Harvous note by id (from search), with its folder, tags and scripture references.',
      inputSchema: { id: id('A note id from search.') },
      annotations: { title: 'Fetch a Harvous note', ...READ_ONLY },
    },
    (args) => run(ctx, 'fetch', async () => json(await reads.fetchForResearch(userId, args.id))),
  );

  server.registerTool(
    'where_i_left_off',
    {
      title: 'Where I left off',
      description:
        'When they ask "where was I?", "what was I studying?", "pick up where I left off" or "what ' +
        'was I reading?": the note they most recently worked on, the Bible chapter to keep reading ' +
        '(resume or next), and their few most recently edited notes — the same answer Harvous Home gives.',
      inputSchema: {},
      annotations: { title: 'Where I left off', ...READ_ONLY },
    },
    () => run(ctx, 'where_i_left_off', async () => json(await reads.whereILeftOff(userId))),
  );

  server.registerTool(
    'list_notes_in_thread',
    {
      title: 'List notes in a thread',
      description:
        'The notes in one thread — a series or topic, like "my Romans series" or "sermon notes" — ' +
        'from list_threads_in_space, with a short snippet of each.',
      inputSchema: { threadId: id('The thread id, from list_threads_in_space.'), limit: limit(PAGE_MAX, 20), cursor },
      annotations: { title: 'List notes in a thread', ...READ_ONLY },
    },
    (args) => run(ctx, 'list_notes_in_thread', async () => json(await reads.listNotesInThread(userId, args))),
  );

  server.registerTool(
    'passage_context',
    {
      title: 'Passage context',
      description:
        'When they want to go deeper on a passage ("what connects to Romans 8:28?", "who is in this ' +
        'chapter?", "cross-references for John 15"): the themes, cross-references, people and places ' +
        'Harvous knows for it, plus their own notes that connect to it. References and names only, ' +
        'never verse text.',
      inputSchema: {
        passage: z.string().trim().min(2).max(120).describe('A Bible reference, e.g. "Romans 8:28" or "John 15:1-11".'),
      },
      annotations: { title: 'Passage context', ...READ_ONLY },
    },
    (args) => run(ctx, 'passage_context', async () => json(await reads.passageContext(userId, args))),
  );

  server.registerTool(
    'start_note',
    {
      title: 'Start a Harvous note',
      description:
        'When they say "start a note in Harvous", "keep studying this in Harvous", "pick this up in ' +
        'Harvous" or "I want to write about this", or say yes when you offer: start ONE new note in ' +
        'their Harvous so they can keep going from this conversation. The note opens with a card ' +
        'labeled as coming from you — your short summary of what you discussed, the passages, and any question they were left with — and an empty page for them to ' +
        'write in. Never write their reflections for them; summarize what was discussed in plain, ' +
        'modest words, and where Christians read a passage differently, say so rather than settling it. ' +
        'Only call this when they ask or accept your offer. It is off until they turn it on in ' +
        'Harvous; if it is refused as turned off, tell them where to turn it on. It cannot change or ' +
        'delete any existing note.',
      inputSchema: {
        title: z.string().trim().min(1).max(120).describe('A short note title, ideally under 50 characters, in their words where possible.'),
        summary: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .describe(
            '2–4 sentences: what you discussed, not conclusions they did not reach or how they feel. ' +
              'Where readings differ, name that rather than choosing one. Shown as your words, not theirs.',
          ),
        passages: z
          .array(z.string().trim().min(2).max(120))
          .max(MAX_PASSAGES)
          .optional()
          .describe('Bible references discussed, e.g. ["Romans 8:28-29", "Genesis 50:20"]. References only, no verse text.'),
        question: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe(
            "A question they were left with, if they voiced one, in one sentence. Don't invent one, and don't phrase it to suggest an answer.",
          ),
      },
      annotations: { title: 'Start a Harvous note', ...CREATES_A_NOTE },
    },
    (args) =>
      run(ctx, 'start_note', async () => {
        const started = await startNote(userId, ctx.clientId, args);
        const dropped = started.droppedPassages.length
          ? ` Left out ${started.droppedPassages.length === 1 ? 'a reference' : 'references'} Harvous couldn't read: ${started.droppedPassages.join(', ')}.`
          : '';
        return {
          content: [
            {
              type: 'text',
              text:
                `Started "${started.title}" in Harvous (My Home). It opens with your summary in a card ` +
                `labeled as from ${started.app}, and an empty page for them to write in. Open it: ${started.url}${dropped}`,
            },
          ],
          structuredContent: started as unknown as Record<string, unknown>,
        };
      }),
  );
}
