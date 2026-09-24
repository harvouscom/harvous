/**
 * `/?enterSpace=<id>` — a link that puts the reader inside one space.
 *
 * Which space you are in is shell state (`setLocation`), not a route, so there was no URL a
 * notification could carry that landed anywhere but My Home: "New from your church" opened the
 * app and left the reader to go and find the channel it was about. Home reads this parameter,
 * switches exactly the way the switcher does, and drops it.
 *
 * Shared by the server (which builds the link) and the SPA (which honours it), so the two cannot
 * drift on the parameter's name.
 */

export const ENTER_SPACE_PARAM = 'enterSpace';

/** Bare id, the same form `?space=` uses — the `space_` prefix is noise in an address bar. */
export function enterSpaceUrl(spaceId: string): string {
  const bare = spaceId.startsWith('space_') ? spaceId.slice('space_'.length) : spaceId;
  return `/?${ENTER_SPACE_PARAM}=${encodeURIComponent(bare)}`;
}
