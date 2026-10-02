import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONNECTOR_TOOL_NAMES } from '../tools';
import { PAGE_MAX, SERVER_INSTRUCTIONS, SPACES_PAGE_MAX } from '../config';

const dir = resolve(process.cwd(), 'server/connector');
const raw = (file: string) => readFileSync(resolve(dir, file), 'utf8');
/** Code only — the doc comments here name the very things the code must not do. */
const source = (file: string) =>
  raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const moduleFiles = readdirSync(dir).filter((f) => f.endsWith('.ts'));

describe('the Connector stays read-only, plus one create (docs/future/CONNECTOR_BOUNDARIES.md)', () => {
  it('ships fourteen tools: thirteen read-only, and start_note the one create', () => {
    expect(CONNECTOR_TOOL_NAMES).toHaveLength(14);
    const tools = source('tools.ts');
    expect(tools.match(/server\.registerTool\(/g) ?? []).toHaveLength(14);
    expect(tools.match(/\.\.\.READ_ONLY \}/g) ?? []).toHaveLength(13);
    expect(tools.match(/\.\.\.CREATES_A_NOTE \}/g) ?? []).toHaveLength(1);
    expect(tools).toMatch(/'start_note',\s*\{[\s\S]*?\.\.\.CREATES_A_NOTE \}/);
    expect(tools).toContain('readOnlyHint: true');
    expect(tools).toContain('destructiveHint: false');
    expect(tools).not.toContain('destructiveHint: true');
  });

  it('never imports a helper that writes as a side effect — write-service may make the thread a note needs', () => {
    for (const file of moduleFiles) {
      const text = source(file);
      const banned = ['ensurePersonalHomeSpace', 'healScriptureNoteThreadsFromParents'];
      if (file !== 'write-service.ts') banned.push('ensureUnorganizedThread');
      for (const writer of banned) {
        expect(text, `${file} must not use ${writer}`).not.toContain(writer);
      }
    }
  });

  it('writes only from its own modules, and only to the tables each one owns', () => {
    const writers: Record<string, string[]> = {
      'usage.ts': ['ConnectorClients', 'ConnectorUsageDays'],
      'tokens.ts': ['ConnectorApiKeys'],
      'preferences.ts': ['ConnectorPreferences'],
      // start_note: insert one note and its card; bump the note counter and touch the thread.
      'write-service.ts': ['Notes', 'NoteChatOrigins', 'UserMetadata', 'Threads'],
    };
    for (const file of moduleFiles.filter((f) => !(f in writers))) {
      expect(source(file), file).not.toMatch(/(db|tx)\s*\.(insert|update|delete)\(/);
    }
    for (const [file, tables] of Object.entries(writers)) {
      for (const m of source(file).matchAll(/(db|tx)\s*\.(insert|update|delete)\((\w+)\)/g)) {
        expect(tables, file).toContain(m[3]);
      }
    }
  });

  it('start_note can only create: it never updates or deletes a note', () => {
    const write = source('write-service.ts');
    expect(write).not.toMatch(/\.delete\(/);
    expect(write).not.toMatch(/\.update\(Notes\)/);
    expect(write).toMatch(/\.insert\(Notes\)/);
    // It takes no note id, so it cannot be pointed at an existing note.
    const tools = source('tools.ts');
    const registration = tools.slice(tools.indexOf("server.registerTool(\n    'start_note'"));
    expect(registration).toContain('...CREATES_A_NOTE }');
    expect(registration.slice(0, registration.indexOf('...CREATES_A_NOTE }'))).not.toMatch(/noteId|spaceId|threadId/);
  });

  it('routes by the words people use: the key phrases stay in the instructions and descriptions', () => {
    for (const phrase of ['my notes', 'my Bible study', 'where was I', 'pick up where I left off', 'save this', 'start a note']) {
      expect(SERVER_INSTRUCTIONS, phrase).toContain(phrase);
    }
    const tools = raw('tools.ts');
    for (const phrase of ['what did I write about', 'Romans 8', 'where was I?', 'save this to Harvous', 'cross-references']) {
      expect(tools, phrase).toContain(phrase);
    }
  });

  it('keeps MCP out of the read service and the database out of the tools', () => {
    expect(source('read-service.ts')).not.toContain('@modelcontextprotocol');
    expect(source('tools.ts')).not.toMatch(/from '\.\.\/db'/);
  });

  it('never reads Bible verse text', () => {
    for (const file of moduleFiles) {
      const text = source(file);
      expect(text, file).not.toMatch(/BibleVerses|VerseTextCache|fetchVerseText|scripturePassageExcerpt|originalText/);
    }
  });

  it('caps every page', () => {
    expect(PAGE_MAX).toBeLessThanOrEqual(25);
    expect(SPACES_PAGE_MAX).toBeLessThanOrEqual(50);
    expect(source('tools.ts')).not.toMatch(/\.max\((?:[5-9]\d|\d{3,})\)\.default/);
  });

  it('lives outside /api/*, so session middleware and CSRF never run on it', () => {
    const app = readFileSync(resolve(process.cwd(), 'server/app.ts'), 'utf8');
    expect(app).toContain("import connector from './connector/mcp-route'");
    expect(source('mcp-route.ts')).not.toMatch(/['"`]\/api\//);
  });
});
