import { describe, expect, it } from 'vitest';
import { connectorSetupMessage } from '../connector-setup-copy';

describe('connectorSetupMessage', () => {
  it('names the URL, transport, discovery document and PKCE', () => {
    const text = connectorSetupMessage('https://mcp.harvous.com/mcp');
    expect(text).toContain('https://mcp.harvous.com/mcp (Streamable HTTP)');
    expect(text).toContain('https://mcp.harvous.com/.well-known/oauth-protected-resource/mcp');
    expect(text).toContain('PKCE (S256)');
    expect(text).toContain('start a new note');
    expect(text).not.toContain('read-only');
    expect(text).not.toMatch(/hvous_|Bearer/);
  });
});
