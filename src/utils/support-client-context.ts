/**
 * Client device / browser context for support ticket submissions.
 * Collected in the browser only — no PII beyond what UA already exposes.
 */

export type SupportClientContext = {
  clientEnvironment: string;
};

const MAX_ENV_LENGTH = 200;

function truncate(value: string, max = MAX_ENV_LENGTH): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function deviceClass(ua: string): string {
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/iPhone|Android|Mobile/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function osLabel(ua: string, platform: string): string {
  const iphone = ua.match(/OS (\d+[_\d]*)/);
  if (/iPhone|iPad|iPod/.test(ua)) {
    return iphone ? `iOS ${iphone[1].replace(/_/g, '.')}` : 'iOS';
  }

  const android = ua.match(/Android (\d+[\d.]*)/);
  if (android) return `Android ${android[1]}`;

  const mac = ua.match(/Mac OS X (\d+[_\d]*)/);
  if (mac) return `macOS ${mac[1].replace(/_/g, '.')}`;

  if (/Windows/.test(ua)) return 'Windows';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';

  return platform.trim() || 'Unknown OS';
}

function browserLabel(ua: string): string {
  const edge = ua.match(/Edg\/(\d+[\d.]*)/);
  if (edge) return `Edge ${edge[1]}`;

  const firefox = ua.match(/Firefox\/(\d+[\d.]*)/);
  if (firefox) return `Firefox ${firefox[1]}`;

  const chrome = ua.match(/Chrome\/(\d+[\d.]*)/);
  if (chrome && !/Chromium/.test(ua)) return `Chrome ${chrome[1]}`;

  const safari = ua.match(/Version\/(\d+[\d.]*)/);
  if (safari && /Safari/.test(ua)) return `Safari ${safari[1]}`;

  return 'Unknown browser';
}

/** Human-readable device · OS · browser string for admin triage. */
export function collectSupportClientContext(): SupportClientContext {
  if (typeof navigator === 'undefined') {
    return { clientEnvironment: 'Unknown' };
  }

  const ua = navigator.userAgent;
  const platform = navigator.platform ?? '';
  const clientEnvironment = truncate(
    [deviceClass(ua), osLabel(ua, platform), browserLabel(ua)].join(' · '),
  );

  return { clientEnvironment };
}
