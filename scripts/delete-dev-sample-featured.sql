-- One-time cleanup: remove dev/test featured carousel rows from production (or any shared DB).
-- Run in Supabase SQL editor. Safe to re-run if rows already deleted.

DELETE FROM "UserFeaturedItems"
WHERE "featuredItemId" IN (
  'votd_fi_dev_sample',
  'fi_dev_sample_space',
  'fi_dev_sample_thread',
  'fi_dev_sample_recall',
  'fi_dev_sample_challenge',
  'fi_dev_sample_church'
);

DELETE FROM "FeaturedItems"
WHERE id IN (
  'votd_fi_dev_sample',
  'fi_dev_sample_space',
  'fi_dev_sample_thread',
  'fi_dev_sample_recall',
  'fi_dev_sample_challenge',
  'fi_dev_sample_church'
);

DELETE FROM "VotdSchedule" WHERE id = 'votd_dev_sample';
