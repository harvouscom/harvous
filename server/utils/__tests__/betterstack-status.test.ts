import { describe, expect, it } from 'vitest';
import { deriveBetterStackUrls, normalizeBetterStackJsonUrl, parseBetterStackStatus } from '../betterstack-status';

const FIXTURE = {
  data: {
    id: '238531',
    type: 'status_page',
    attributes: {
      announcement: 'Scheduled maintenance tonight',
      aggregate_state: 'degraded',
      updated_at: '2026-07-06T19:16:07.014Z',
    },
    relationships: {
      sections: { data: [{ id: '1', type: 'status_page_section' }] },
      resources: { data: [{ id: '10', type: 'status_page_resource' }] },
      status_reports: { data: [{ id: '20', type: 'status_report' }] },
    },
  },
  included: [
    { id: '1', type: 'status_page_section', attributes: { name: 'Core', position: 0 } },
    {
      id: '10',
      type: 'status_page_resource',
      attributes: {
        status_page_section_id: 1,
        public_name: 'API',
        explanation: 'Hono API',
        position: 0,
        availability: 99.9,
        status: 'operational',
      },
    },
    {
      id: '20',
      type: 'status_report',
      attributes: {
        title: 'API latency',
        report_type: 'manual',
        starts_at: '2026-07-06T18:00:00.000Z',
        ends_at: null,
        aggregate_state: 'degraded',
      },
      relationships: {
        status_updates: { data: [{ id: '30', type: 'status_update' }] },
      },
    },
    {
      id: '30',
      type: 'status_update',
      attributes: {
        message: 'Investigating elevated latency',
        published_at: '2026-07-06T18:05:00.000Z',
      },
    },
  ],
};

describe('deriveBetterStackUrls', () => {
  it('derives hosted page and RSS URLs from JSON endpoint', () => {
    expect(deriveBetterStackUrls('https://example.betteruptime.com/index.json')).toEqual({
      subscribeUrl: 'https://example.betteruptime.com',
      rssUrl: 'https://example.betteruptime.com/rss',
    });
  });
});

describe('normalizeBetterStackJsonUrl', () => {
  it('adds scheme and /index.json to bare hostnames', () => {
    expect(normalizeBetterStackJsonUrl('status.harvous.com')).toBe('https://status.harvous.com/index.json');
  });

  it('preserves full JSON URLs', () => {
    expect(normalizeBetterStackJsonUrl('https://harvous.betteruptime.com/index.json')).toBe(
      'https://harvous.betteruptime.com/index.json',
    );
  });
});

describe('parseBetterStackStatus', () => {
  it('normalizes JSON:API into flat public status shape', () => {
    const result = parseBetterStackStatus(FIXTURE, 'https://example.betteruptime.com/index.json');
    expect(result.aggregateState).toBe('degraded');
    expect(result.announcement).toBe('Scheduled maintenance tonight');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].resources[0].name).toBe('API');
    expect(result.incidents[0].title).toBe('API latency');
    expect(result.incidents[0].updates[0].message).toContain('Investigating');
    expect(result.rssUrl).toBe('https://example.betteruptime.com/rss');
  });

  it('defaults unknown aggregate state to operational', () => {
    const result = parseBetterStackStatus(
      { data: { type: 'status_page', attributes: { aggregate_state: 'unknown' } }, included: [] },
      'https://example.betteruptime.com/index.json',
    );
    expect(result.aggregateState).toBe('operational');
  });
});
