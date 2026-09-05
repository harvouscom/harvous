/**
 * `getPushSupport()` — the five answers to "can this device show a reminder?".
 *
 * Every branch here corresponds to different copy on the settings page, and the one that
 * matters most is `needs-home-screen`: an iPhone in Safari genuinely cannot subscribe, but
 * telling that reader "your browser can't" would be false and would send them away from the
 * one thing that fixes it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPushSupport, testSendToastMessage } from '../push-reminders';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

interface Setup {
  userAgent?: string;
  hasPushApi?: boolean;
  standalone?: boolean;
  permission?: NotificationPermission;
}

function setup({
  userAgent = DESKTOP_UA,
  hasPushApi = true,
  standalone = false,
  permission = 'default',
}: Setup) {
  vi.stubGlobal('navigator', {
    userAgent,
    serviceWorker: hasPushApi ? {} : undefined,
    standalone,
  });
  vi.stubGlobal('Notification', hasPushApi ? { permission } : undefined);
  vi.stubGlobal('window', {
    PushManager: hasPushApi ? function PushManager() {} : undefined,
    Notification: hasPushApi ? { permission } : undefined,
    navigator: { userAgent, standalone },
    matchMedia: (query: string) => ({
      matches: standalone && query.includes('display-mode'),
    }),
  });
  // `isPWA` and `getPushSupport` read window.matchMedia and document.referrer.
  vi.stubGlobal('document', { referrer: '' });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getPushSupport', () => {
  it('reports a desktop browser that has never been asked as ready to ask', () => {
    setup({});
    expect(getPushSupport()).toBe('default');
  });

  it('reports an already-granted browser as granted', () => {
    setup({ permission: 'granted' });
    expect(getPushSupport()).toBe('granted');
  });

  it('reports a blocked browser as denied, not as unsupported', () => {
    // Denied is recoverable only through site settings, so the page must say so rather than
    // offering a button that can no longer prompt.
    setup({ permission: 'denied' });
    expect(getPushSupport()).toBe('denied');
  });

  it('reports a browser without the Push API as unsupported', () => {
    setup({ hasPushApi: false });
    expect(getPushSupport()).toBe('unsupported');
  });

  it('treats an insecure context as unsupported rather than throwing', () => {
    // Over http on a LAN address — the way a phone reaches a dev server — the browser leaves
    // navigator.serviceWorker undefined while the property still exists on the prototype.
    setup({});
    vi.stubGlobal('navigator', { userAgent: DESKTOP_UA, serviceWorker: undefined });
    expect(getPushSupport()).toBe('unsupported');
  });

  it('tells an iPhone in Safari to install first, even though the APIs are present', () => {
    setup({ userAgent: IOS_UA });
    expect(getPushSupport()).toBe('needs-home-screen');
  });

  it('tells an iPhone in Safari to install first when the APIs are absent too', () => {
    // Older iOS hides PushManager outside standalone; "your browser can't" would be a lie.
    setup({ userAgent: IOS_UA, hasPushApi: false });
    expect(getPushSupport()).toBe('needs-home-screen');
  });

  it('lets an installed iOS Home Screen app through to the prompt', () => {
    setup({ userAgent: IOS_UA, standalone: true });
    expect(getPushSupport()).toBe('default');
  });
});

describe('testSendToastMessage', () => {
  it('tells an iPhone user the one thing that is not obvious', () => {
    // iOS suppresses a notification while its own app is in the foreground, so standing
    // still looks exactly like the feature being broken.
    setup({ userAgent: IOS_UA, standalone: true, permission: 'granted' });
    expect(testSendToastMessage()).toBe('Sent. Leave Harvous to see it.');
  });

  it('does not tell a desktop user to leave, where the banner appears anyway', () => {
    setup({ permission: 'granted' });
    expect(testSendToastMessage()).toBe('Sent. It should appear in a moment.');
  });

  it('never reports a device count', () => {
    // "Sent to 2 devices" leads with a number that a reinstall makes wrong, and answers a
    // question nobody asked at that moment. The settings row states it instead.
    setup({ userAgent: IOS_UA, standalone: true, permission: 'granted' });
    expect(testSendToastMessage()).not.toMatch(/\d/);
    setup({ permission: 'granted' });
    expect(testSendToastMessage()).not.toMatch(/\d/);
  });
});
