import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appsStillToSetUp, displayAppName, setupAppForClient } from '../PrototypeConnectorPage';

const source = () =>
  readFileSync(resolve(process.cwd(), 'spa/src/pages/prototype/settings/PrototypeConnectorPage.tsx'), 'utf8');

describe('connected app names', () => {
  it('shows the name people know, not what the app calls itself', () => {
    // What Claude actually reported on its first production connection.
    expect(displayAppName('Anthropic/ClaudeAI')).toBe('Claude');
    expect(displayAppName('openai-mcp')).toBe('ChatGPT');
    expect(displayAppName('ChatGPT')).toBe('ChatGPT');
    expect(displayAppName('Cursor')).toBe('Cursor');
    expect(displayAppName('meta-ai-muse')).toBe('Muse');
    expect(displayAppName('Grok Bot')).toBe('Grok');
    expect(displayAppName('Personal token')).toBe('Personal token');
    expect(displayAppName('acme/notes-bot')).toBe('notes-bot');
    expect(displayAppName('   ')).toBe('Unknown app');
  });
});

describe('setup guide', () => {
  it('opens each app’s own settings from the first step', () => {
    const text = source();
    expect(text).toContain("href: 'https://claude.ai/settings/connectors'");
    expect(text).toContain("href: 'https://chatgpt.com/#settings/Connectors'");
    expect(text).toContain("window.open(step.href, '_blank', 'noopener,noreferrer')");
  });

  it('tells ChatGPT users the two things that trip them up: Developer mode and OAuth', () => {
    const text = source();
    expect(text).toContain('Turn on Developer mode');
    expect(text).toContain('choose OAuth');
  });

  it('only shows usage once there is some', () => {
    expect(source()).toContain('data.usage.today > 0');
  });
});

describe('setup tabs', () => {
  it('drops the tab for an app that is connected', () => {
    expect(appsStillToSetUp([{ name: 'Anthropic/ClaudeAI', disconnected: false }])).toEqual(['chatgpt', 'grok', 'muse']);
  });
  it('keeps the tab for a disconnected app, and ignores apps without one', () => {
    expect(
      appsStillToSetUp([
        { name: 'openai-mcp', disconnected: true },
        { name: 'Cursor', disconnected: false },
        { name: 'Personal token', disconnected: false },
      ]),
    ).toEqual(['claude', 'chatgpt', 'grok', 'muse']);
  });
  it('has nothing left to set up once all four are connected', () => {
    const all = ['Claude', 'ChatGPT', 'Grok', 'meta-ai-muse'].map((name) => ({ name, disconnected: false }));
    expect(appsStillToSetUp(all)).toEqual([]);
  });
  it('maps a connected app to its tab', () => {
    expect(setupAppForClient('Grok Bot')).toBe('grok');
    expect(setupAppForClient('Cursor')).toBeNull();
  });
});
