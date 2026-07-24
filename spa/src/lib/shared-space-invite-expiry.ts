export type InviteExpiryPreset = '7d' | '30d' | 'never' | 'custom';

export const INVITE_EXPIRY_PRESETS: ReadonlyArray<{ id: InviteExpiryPreset; label: string }> = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'never', label: 'Never' },
  { id: 'custom', label: 'Pick a date' },
];

const PRESET_DAYS: Record<Exclude<InviteExpiryPreset, 'never' | 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
};

/** Earliest selectable custom date (tomorrow, local calendar day). */
export function inviteExpiryMinDateInputValue(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function resolveInviteExpiresAt(preset: InviteExpiryPreset, customDate: string): string | null {
  if (preset === 'never') return null;
  if (preset === 'custom') {
    if (!customDate.trim()) throw new Error('Pick an expiration date');
    const parsed = new Date(`${customDate}T23:59:59.999`);
    if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
      throw new Error('Expiration must be a future date');
    }
    return parsed.toISOString();
  }
  const days = PRESET_DAYS[preset];
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function formatInviteExpiry(expiresAt: string | null): string {
  if (!expiresAt) return 'No expiry';
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return `Expires ${d.toLocaleDateString(undefined, opts)}`;
}
