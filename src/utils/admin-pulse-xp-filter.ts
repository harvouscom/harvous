/** Whether a UserXP row counts as prototype study-thread thread_created XP in admin Pulse. */
export function isStudyThreadCreatedXpRecord(record: {
  activityType: string;
  relatedId: string | null;
  metadata: string | null;
}): boolean {
  if (record.activityType !== 'thread_created') return true;
  if (record.relatedId?.startsWith('note_')) return true;
  if (record.metadata?.includes('"kind":"study_thread"')) return true;
  return false;
}
