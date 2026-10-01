/**
 * The Connector's seven MCP tools. The only module here that knows about MCP.
 *
 * Each tool: Zod input shape (the published schema *is* the validator) → `beforeCall`
 * (access, disconnected-app check, rate limits) → `connectorReadService` → result.
 * A `ConnectorRefusal` becomes a normal tool result with `isError: true` and readable text —
 * the assistant can relay it. Anything else is a real failure and is logged.
 *
 * Read-only forever (docs/future/CONNECTOR_BOUNDARIES.md): every tool is annotated so, and
 * tools-contract.test.ts fails if a tool appears without the read-only hint.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { PAGE_MAX, SPACES_PAGE_MAX } from './config';
import * as reads from './read-service';
import { ConnectorRefusal, type NoteDetail } from './shapes';

export interface ToolContext {
  userId: string;
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

export const CONNECTOR_TOOL_NAMES = [
  'search_notes',
  'get_note',
  'list_spaces',
  'list_threads_in_space',
  'list_notes_in_space',
  'list_study_thread_connections',
  'get_shared_note',
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
        'Full-text search across the notes this person wrote (titles, bodies, tags, scripture ' +
        'references). Optionally limit to one space. Returns short snippets; use get_note for the full text.',
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
}
