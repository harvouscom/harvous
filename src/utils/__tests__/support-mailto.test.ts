import { describe, it, expect } from 'vitest';
import { buildFeedbackMailto, buildFounderMailto, buildTicketReplyMailto, FOUNDER_EMAIL } from '../support-mailto';

describe('support-mailto', () => {
  it('exports founder email', () => {
    expect(FOUNDER_EMAIL).toBe('derek@harvous.com');
  });

  it('builds mailto with default subject and encoded body metadata', () => {
    const url = buildFeedbackMailto({
      message: 'Love the app!',
      profile: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      version: '1.217.146',
      pageUrl: 'https://app.harvous.com/prototype/settings/support',
    });

    expect(url.startsWith(`mailto:${FOUNDER_EMAIL}?`)).toBe(true);
    const query = url.slice(`mailto:${FOUNDER_EMAIL}?`.length);
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toBe('Harvous feedback');
    expect(params.get('body')).toContain('Love the app!');
    expect(params.get('body')).toContain('From: Jane Doe');
    expect(params.get('body')).toContain('Reply-to: jane@example.com');
    expect(params.get('body')).toContain('App version: 1.217.146');
    expect(params.get('body')).toContain('Page: https://app.harvous.com/prototype/settings/support');
  });

  it('includes topic in subject when provided', () => {
    const url = buildFeedbackMailto({ message: 'Crash on save', topic: 'Bug' });
    const query = url.slice(`mailto:${FOUNDER_EMAIL}?`.length);
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toBe('Harvous feedback — Bug');
  });

  it('encodes special characters in message and metadata', () => {
    const url = buildFeedbackMailto({
      message: 'Line one\nLine two & more',
      profile: { email: 'user+tag@example.com' },
    });
    const query = url.slice(`mailto:${FOUNDER_EMAIL}?`.length);
    const params = new URLSearchParams(query);
    expect(params.get('body')).toContain('Line one\nLine two & more');
    expect(params.get('body')).toContain('user+tag@example.com');
  });

  it('builds founder mailto with subject only', () => {
    expect(buildFounderMailto()).toBe(`mailto:${FOUNDER_EMAIL}?subject=${encodeURIComponent('Harvous support')}`);
  });

  it('builds ticket reply mailto for admin', () => {
    const url = buildTicketReplyMailto({
      ticketNumber: 42,
      ticketId: '42',
      userEmail: 'jane@example.com',
      topic: 'Bug',
      originalMessage: 'App crashed on save',
    });

    expect(url.startsWith('mailto:jane@example.com?')).toBe(true);
    const query = url.slice('mailto:jane@example.com?'.length);
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toBe('Re: Harvous feedback — Bug [#42]');
    expect(params.get('body')).toContain('App crashed on save');
    expect(params.get('body')).toContain('Ticket: #42');
  });

  it('falls back to legacy ticket id in reply mailto', () => {
    const url = buildTicketReplyMailto({
      ticketNumber: null,
      ticketId: 'supportticket_123',
      userEmail: 'jane@example.com',
      topic: 'Bug',
      originalMessage: 'App crashed on save',
    });

    const query = url.slice('mailto:jane@example.com?'.length);
    const params = new URLSearchParams(query);
    expect(params.get('subject')).toBe('Re: Harvous feedback — Bug [#supportticket_123]');
  });
});
