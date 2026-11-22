import { describe, expect, it } from 'vitest';
import { CHILD_NOTICE_VERSION } from '../policy';
import { noticeChangeEmail } from '../notice-change-email';
import { parseChanges, renewUrlFor } from '../../scripts/child-notice-change-email';

const base = {
  changes: ['We now keep the date each verse sticker was added, so My Bible can sort them.'],
  notebookCount: 1,
  renewUrl: 'https://app.harvous.com/settings/child-accounts',
  privacyUrl: 'https://harvous.com/privacy/children/'
};

describe('notice-change email', () => {
  it('says what changed, how to renew, and links the policy', () => {
    const email = noticeChangeEmail(base);
    expect(email.text).toContain(base.changes[0]);
    expect(email.text).toContain(`Sign in at ${base.renewUrl}`);
    expect(email.text).toContain(base.privacyUrl);
    expect(email.text).toContain('Agree and resume notebook');
    expect(email.text).toContain(`Notice version ${CHILD_NOTICE_VERSION}`);
    expect(email.html).toContain(`<a href="${base.privacyUrl}">`);
    expect(email.text.startsWith('Hey,')).toBe(true);
    expect(email.html).toContain('alt="Harvous"');
  });

  it('carries the policy contact details', () => {
    const { text } = noticeChangeEmail(base);
    for (const part of ['derek@harvous.com', '515-802-1628', 'Testament Made LLC', 'Waukee, IA 50263']) expect(text).toContain(part);
  });

  it('reads naturally for one notebook or several', () => {
    expect(noticeChangeEmail(base).text).toContain("your child's notebook is paused");
    expect(noticeChangeEmail({ ...base, notebookCount: 3 }).text).toContain('your child notebooks are paused');
  });

  it('escapes the changes in HTML', () => {
    const { html } = noticeChangeEmail({ ...base, changes: ['Notes <b>and</b> "thoughts"'] });
    expect(html).toContain('Notes &lt;b&gt;and&lt;/b&gt; &quot;thoughts&quot;');
  });

  it('refuses an email that does not say what changed, or a non-https link', () => {
    expect(() => noticeChangeEmail({ ...base, changes: ['  '] })).toThrow(/what changed/);
    expect(() => noticeChangeEmail({ ...base, renewUrl: 'http://app.harvous.com/' })).toThrow(/https/);
    expect(() => noticeChangeEmail({ ...base, notebookCount: 0 })).toThrow();
  });
});

describe('notice-change script helpers', () => {
  it('reads one change per line', () => {
    expect(parseChanges('- First change\n\n* Second change\nThird\n')).toEqual(['First change', 'Second change', 'Third']);
  });
  it('sends parents to child notebooks on the parent app', () => {
    expect(renewUrlFor({})).toBe('https://app.harvous.com/settings/child-accounts');
    expect(renewUrlFor({ HARVOUS_PARENT_APP_URL: 'https://family-test.harvous.com' })).toBe('https://family-test.harvous.com/settings/child-accounts');
  });
});
