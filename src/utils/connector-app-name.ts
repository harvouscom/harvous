/**
 * Which AI app is this? One answer for the three places that ask: Settings › Connector's
 * Connected apps, the `mcp-<slug>` stamped on a note an app started (`Notes.addedBy`), and the
 * side panel's "Started in" row that reads it back. Pure.
 *
 * Apps name themselves at `initialize` ("Anthropic/ClaudeAI", "openai-mcp", "meta-ai-muse"),
 * so the known ones are matched loosely and shown by the name people use.
 */

const KNOWN_APPS = [
  { slug: 'claude', name: 'Claude', pattern: /claude|anthropic/i },
  { slug: 'chatgpt', name: 'ChatGPT', pattern: /chatgpt|openai/i },
  { slug: 'grok', name: 'Grok', pattern: /grok|xai/i },
  { slug: 'muse', name: 'Muse', pattern: /muse|meta[\s_-]?ai/i },
  { slug: 'cursor', name: 'Cursor', pattern: /cursor/i },
] as const;

export type ConnectorAppSlug = (typeof KNOWN_APPS)[number]['slug'] | 'app';

export interface ConnectorApp {
  slug: ConnectorAppSlug;
  /** What to show: the known name, else the app's own (last path segment), else "an AI app". */
  name: string;
}

export function connectorAppFromClientName(raw: string | null | undefined): ConnectorApp {
  const name = raw?.trim() ?? '';
  const known = KNOWN_APPS.find((app) => app.pattern.test(name));
  if (known) return { slug: known.slug, name: known.name };
  const last = name.split('/').pop()?.trim();
  return { slug: 'app', name: last || 'an AI app' };
}

/** `Notes.addedBy` for a note an app started. */
export function connectorAddedBy(app: ConnectorApp): string {
  return `mcp-${app.slug}`;
}

/** "Claude" for `mcp-claude`; "an AI app" for `mcp-app`; null for a note not started by an app. */
export function startedInFromAddedBy(addedBy: string | null | undefined): string | null {
  const match = /^mcp-([a-z]+)$/.exec(addedBy?.trim() ?? '');
  if (!match) return null;
  return KNOWN_APPS.find((app) => app.slug === match[1])?.name ?? 'an AI app';
}
