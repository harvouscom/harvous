/**
 * The setup message for apps that build their own connector from a conversation (Muse) — and
 * for any assistant that can follow one. Pure, so the exact words are testable.
 *
 * Says only what a client needs to connect on its own: the URL, the transport, where OAuth
 * discovery starts, and that it registers itself as a public PKCE client. No secrets: the
 * person still signs in with their own Harvous account.
 */
export function connectorSetupMessage(mcpUrl: string): string {
  const discovery = (() => {
    try {
      const url = new URL(mcpUrl);
      return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
    } catch {
      return '/.well-known/oauth-protected-resource/mcp';
    }
  })();
  return [
    'Please add a custom connector for Harvous, my Bible study notes app.',
    `Its MCP server is ${mcpUrl} (Streamable HTTP).`,
    `It uses OAuth: discover it at ${discovery}, register as a public client with PKCE (S256), and I’ll sign in with my Harvous account.`,
    'It reads my study and can start a new note when I ask; it can’t change or delete anything I’ve written.',
    'Once connected, list its tools and try find_by_passage for Romans 8.',
  ].join(' ');
}
