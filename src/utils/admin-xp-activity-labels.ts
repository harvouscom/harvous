/** Human labels for UserXP.activityType — shared by admin Pulse and server stats. */
export const XP_ACTIVITY_LABELS: Record<string, string> = {
  session_completed: 'Study sessions',
  creation_bonus: 'Creation bonuses',
  church_added: 'Church added',
  monthly_attendance: 'Monthly attendance',
  new_season: 'New season return',
  weekly_streak: 'Weekly streaks',
  referral_credited: 'Referrals',
  thread_created: 'Threads created',
  note_created: 'Notes created',
  note_opened: 'Notes opened',
  first_note_daily: 'First note of day',
  votd_engaged: 'Verse of the Day',
};

export function xpActivityLabel(activityType: string): string {
  return XP_ACTIVITY_LABELS[activityType] ?? activityType.replace(/_/g, ' ');
}
