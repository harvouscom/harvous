/**
 * Client device / browser context for support ticket submissions.
 * Collected in the browser only — no PII beyond what UA already exposes.
 */

export type SupportClientContext = {
  clientEnvironment: string;
};

const MAX_ENV_LENGTH = 400;

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

function viewportLabel(): string | null {
  if (typeof window === 'undefined') return null;
  return `${window.innerWidth}×${window.innerHeight}`;
}

function pixelRatioLabel(): string | null {
  if (typeof window === 'undefined') return null;
  const dpr = window.devicePixelRatio;
  if (!Number.isFinite(dpr)) return null;
  return `${dpr}x`;
}

function displayModeLabel(): string | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia('(display-mode: standalone)').matches ? 'PWA' : 'Browser';
}

function onlineLabel(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.onLine ? 'Online' : 'Offline';
}

function localeLabel(): string | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.language?.trim() || null;
}

/** Human-readable device · OS · browser string for admin triage. */
export function collectSupportClientContext(): SupportClientContext {
  if (typeof navigator === 'undefined') {
    return { clientEnvironment: 'Unknown' };
  }

  const ua = navigator.userAgent;
  const platform = navigator.platform ?? '';
  const parts = [
    deviceClass(ua),
    osLabel(ua, platform),
    browserLabel(ua),
    viewportLabel(),
    pixelRatioLabel(),
    displayModeLabel(),
    onlineLabel(),
    localeLabel(),
  ].filter((part): part is string => Boolean(part));

  return { clientEnvironment: truncate(parts.join(' · ')) };
}
