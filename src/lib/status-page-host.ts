export const STATUS_HOST = 'status.harvous.com';

export function isStatusHost(hostname?: string): boolean {
  const h = hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '');
  return h === STATUS_HOST;
}
