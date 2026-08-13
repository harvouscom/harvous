/**
 * The meeting link is the key to the room, and a join link is handed to people
 * who are not in the room yet. These are the two places that must never carry
 * it, asserted against source because both are easy to widen by accident —
 * `meetingUrl` is one more field on payloads that already spread six others.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

/** The unauthenticated invite-preview handler, sliced out by its own route line. */
function invitePreviewRoute(): string {
  const text = source('server/routes/spaces.ts');
  const start = text.indexOf("route.get('/api/spaces/invite-preview/:token'");
  expect(start).toBeGreaterThan(-1);
  const end = text.indexOf('route.', start + 10);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe('the meeting link never reaches someone who has not joined', () => {
  it('is absent from the unauthenticated invite preview', () => {
    // This endpoint takes a token from the URL and answers without auth. It
    // builds an explicit field whitelist rather than spreading the space row —
    // keep it that way.
    const block = invitePreviewRoute();
    expect(block).not.toContain('meetingUrl');
    expect(block).not.toMatch(/\.\.\.space[,\s}]/);
  });

  it('is absent from the public join letter', () => {
    // The invite page's own component. The in-space About card renders the link
    // by wrapping this one, so the boundary is which component holds it.
    const letter = source('spa/src/pages/public/PublicJoinSpaceLetter.tsx');
    expect(letter).not.toContain('meetingUrl');
  });

  it('is rendered by the in-space About card, which is the point', () => {
    const about = source('spa/src/pages/prototype/SharedSpaceAboutLetter.tsx');
    expect(about).toContain('meetingUrl');
    // Opened deliberately, in a new tab, with no window.opener back-reference.
    expect(about).toContain('rel="noopener noreferrer"');
  });
});

describe('a channel publishes rather than gathers', () => {
  it('refuses a meeting place on a ministry channel', () => {
    const text = source('server/routes/spaces.ts');
    expect(text).toContain('MEETING_PLACE_NOT_A_CHANNEL');
    expect(text).toContain('MEETING_RHYTHM_NOT_A_CHANNEL');
  });
});
