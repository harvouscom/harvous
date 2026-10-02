import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONNECTOR_TOOL_NAMES } from '../tools';
import { PAGE_MAX, SPACES_PAGE_MAX } from '../config';

const dir = resolve(process.cwd(), 'server/connector');
const raw = (file: string) => readFileSync(resolve(dir, file), 'utf8');
/** Code only — the doc comments here name the very things the code must not do. */
const source = (file: string) =>
  raw(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const moduleFiles = readdirSync(dir).filter((f) => f.endsWith('.ts'));

describe('the Connector stays read-only (docs/future/CONNECTOR_BOUNDARIES.md)', () => {
  it('ships exactly ten tools, every one annotated read-only', () => {
    expect(CONNECTOR_TOOL_NAMES).toHaveLength(10);
    const tools = source('tools.ts');
    const registrations = tools.match(/server\.registerTool\(/g) ?? [];
    expect(registrations).toHaveLength(10);
    const readOnlySpreads = tools.match(/\.\.\.READ_ONLY \}/g) ?? [];
    expect(readOnlySpreads).toHaveLength(10);
    expect(tools).toContain('readOnlyHint: true');
    expect(tools).toContain('destructiveHint: false');
  });

  it('never imports a helper that writes as a side effect', () => {
    for (const file of moduleFiles) {
      const text = source(file);
      for (const writer of ['ensurePersonalHomeSpace', 'healScriptureNoteThreadsFromParents', 'ensureUnorganizedThread']) {
        expect(text, `${file} must not use ${writer}`).not.toContain(writer);
      }
    }
  });

  it('only usage.ts and tokens.ts write, and only the Connector’s own bookkeeping tables', () => {
    const writers: Record<string, string[]> = {
      'usage.ts': ['ConnectorClients', 'ConnectorUsageDays'],
      'tokens.ts': ['ConnectorApiKeys'],
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
