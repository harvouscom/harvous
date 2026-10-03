import { describe, expect, it } from 'vitest';
import { connectorAddedBy, connectorAppFromClientName, startedInFromAddedBy } from '../connector-app-name';

describe('connector app names', () => {
  it('matches the apps the setup guide covers', () => {
    expect(connectorAppFromClientName('Anthropic/ClaudeAI')).toEqual({ slug: 'claude', name: 'Claude' });
    expect(connectorAppFromClientName('openai-mcp')).toEqual({ slug: 'chatgpt', name: 'ChatGPT' });
    expect(connectorAppFromClientName('Grok Bot')).toEqual({ slug: 'grok', name: 'Grok' });
    expect(connectorAppFromClientName('meta-ai-muse')).toEqual({ slug: 'muse', name: 'Muse' });
  });
  it('keeps an unknown app’s own name, and has a fallback', () => {
    expect(connectorAppFromClientName('acme/notes-bot')).toEqual({ slug: 'app', name: 'notes-bot' });
    expect(connectorAppFromClientName(null)).toEqual({ slug: 'app', name: 'an AI app' });
  });
  it('round-trips through Notes.addedBy', () => {
    expect(startedInFromAddedBy(connectorAddedBy(connectorAppFromClientName('Claude')))).toBe('Claude');
    expect(startedInFromAddedBy('mcp-app')).toBe('an AI app');
    expect(startedInFromAddedBy('user')).toBeNull();
    expect(startedInFromAddedBy('harvous')).toBeNull();
  });
});
