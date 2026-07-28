/**
 * Fire-and-forget Audienceful product milestones (client-only signals).
 * Server merges monotonic boolean flags; never send content or IDs here.
 */

export type AudiencefulMilestone = 'note_opened' | 'upgrade_viewed' | 'checkout_started';

const SESSION_KEY_PREFIX = 'af_milestone:';

function sessionKey(milestone: AudiencefulMilestone, userScope?: string): string {
  return `${SESSION_KEY_PREFIX}${milestone}:${userScope || 'anon'}`;
}

async function postMilestones(milestones: AudiencefulMilestone[]): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const clerk = (
      window as unknown as {
        Clerk?: { session?: { getToken?: () => Promise<string | null> } };
      }
    ).Clerk;
    const token = await clerk?.session?.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* cookies still sent */
  }

  await fetch('/api/user/audienceful-milestones', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ milestones }),
  });
}

/** Record a milestone once per browser session (optional scope e.g. user id). */
export function recordAudiencefulMilestoneOnce(
  milestone: AudiencefulMilestone,
  options?: { userScope?: string },
): void {
  if (typeof window === 'undefined') return;
  const key = sessionKey(milestone, options?.userScope);
  try {
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
  } catch {
    /* private mode — still attempt once */
  }
  void postMilestones([milestone]).catch(() => {});
}
