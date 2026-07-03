import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('handleAggregateAnalytics route', () => {
  const adminSrc = readFileSync(join(__dirname, '../../routes/admin.ts'), 'utf8');

  it('handles aggregation and report generation in separate try/catch blocks', () => {
    expect(adminSrc).toContain('aggregated: false');
    expect(adminSrc).toContain('aggregated: true');
    expect(adminSrc).toContain('Monthly report snapshot failed');
    expect(adminSrc).toContain('Aggregation failed');
  });

  it('returns partial success when report fails after aggregation', () => {
    expect(adminSrc).toMatch(
      /aggregated: true,\s*\n\s*reportGenerated: false,\s*\n\s*error: 'Monthly report snapshot failed'/,
    );
  });
});

describe('aggregate-analytics GitHub workflow', () => {
  const workflowSrc = readFileSync(
    join(__dirname, '../../../.github/workflows/aggregate-analytics.yml'),
    'utf8',
  );

  it('requires the secret token', () => {
    expect(workflowSrc).toContain('AUTO_ARCHIVE_SECRET_TOKEN GitHub secret is required');
  });

  it('fails the job on non-2xx HTTP status', () => {
    expect(workflowSrc).toContain('http_code');
    expect(workflowSrc).toContain('exit 1');
  });

  it('runs aggregation and report generation as separate API calls', () => {
    expect(workflowSrc).toContain('skipReport=1');
    expect(workflowSrc).toContain('/api/admin/reports/generate');
  });
});

describe('Maintenance aggregate analytics client', () => {
  const hookSrc = readFileSync(join(__dirname, '../../../src/hooks/queries/useAdminMaintenance.ts'), 'utf8');

  it('uses POST for aggregate analytics', () => {
    expect(hookSrc).toContain('adminApiPost<AggregateAnalyticsResult>');
    expect(hookSrc).toContain('/api/admin/aggregate-analytics');
  });

  it('runs aggregation and report generation as separate requests', () => {
    expect(hookSrc).toContain('skipReport');
    expect(hookSrc).toContain('/api/admin/reports/generate');
  });

  it('surfaces server details in admin API errors', () => {
    expect(hookSrc).toContain('formatAdminApiError');
    expect(hookSrc).toContain('body.details');
  });
});
