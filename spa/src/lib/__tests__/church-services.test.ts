import { describe, it, expect } from 'vitest';
import {
  SERVICE_GRACE_DAYS,
  buildStarterContent,
  currentSeriesTitle,
  currentServiceFor,
  serviceEyebrow,
  starterNoteTitle,
  type ChurchService,
} from '../church-services';

function service(overrides: Partial<ChurchService> & { serviceDate: string }): ChurchService {
  return {
    id: `svc_${overrides.serviceDate}`,
    title: 'No Condemnation',
    seriesTitle: 'Life in the Spirit',
    reference: 'Romans 8:1-11',
    viewerNoteId: null,
    starter: null,
    ...overrides,
  };
}

describe('SERVICE_GRACE_DAYS', () => {
  it('is the four-day wall, not a round number', () => {
    // Tied to the Center for Bible Engagement finding on harvous.com/about.
    // If this ever "tidies" to 3 or 7, the card stops covering Monday-morning
    // sermon write-ups (or overstays into the next week).
    expect(SERVICE_GRACE_DAYS).toBe(4);
  });
});

describe('currentServiceFor', () => {
  const sunday = service({ serviceDate: '2026-08-09' });
  const nextSunday = service({ serviceDate: '2026-08-16', title: 'Led by the Spirit' });

  it('prefers the soonest upcoming service', () => {
    const current = currentServiceFor([sunday, nextSunday], '2026-08-05');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('counts today as upcoming, so Sunday morning still shows Sunday', () => {
    const current = currentServiceFor([sunday, nextSunday], '2026-08-09');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('skips past services when a future one exists', () => {
    const current = currentServiceFor([sunday, nextSunday], '2026-08-10');
    expect(current?.serviceDate).toBe('2026-08-16');
  });

  it('falls back to the most recent past service inside the grace window', () => {
    // Monday: the church has not entered next week yet, and this is exactly
    // when someone writes up Sunday.
    const current = currentServiceFor([sunday], '2026-08-10');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('still shows a service on day 4 after', () => {
    const current = currentServiceFor([sunday], '2026-08-13');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('shows nothing on day 5 after', () => {
    expect(currentServiceFor([sunday], '2026-08-14')).toBeNull();
  });

  it('returns null for an empty plan', () => {
    expect(currentServiceFor([], '2026-08-09')).toBeNull();
  });

  it('does not rely on input ordering', () => {
    const current = currentServiceFor([nextSunday, sunday], '2026-08-05');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('ignores malformed dates rather than throwing', () => {
    const bad = service({ serviceDate: 'not-a-date' });
    expect(currentServiceFor([bad, sunday], '2026-08-05')?.serviceDate).toBe('2026-08-09');
  });
});

describe('serviceEyebrow', () => {
  // 2026-08-09 is a Sunday.
  it('reads "Today" on the day itself', () => {
    expect(serviceEyebrow({ serviceDate: '2026-08-09' }, '2026-08-09')).toBe('Today');
  });

  it('reads "This Sunday" in the run-up', () => {
    expect(serviceEyebrow({ serviceDate: '2026-08-09' }, '2026-08-07')).toBe('This Sunday');
  });

  it('reads "Last Sunday" after it passes', () => {
    expect(serviceEyebrow({ serviceDate: '2026-08-09' }, '2026-08-10')).toBe('Last Sunday');
  });

  it('does not call a service three weeks out "This Sunday"', () => {
    // A small lie here makes the whole card untrustworthy.
    expect(serviceEyebrow({ serviceDate: '2026-08-30' }, '2026-08-05')).toBe('Sunday, Aug 30');
  });

  it('uses the service’s real weekday, so a midweek study is not called Sunday', () => {
    // 2026-08-12 is a Wednesday.
    expect(serviceEyebrow({ serviceDate: '2026-08-12' }, '2026-08-10')).toBe('This Wednesday');
  });

  it('a Saturday viewer and a Monday viewer read the same service differently', () => {
    const svc = { serviceDate: '2026-08-09' };
    expect(serviceEyebrow(svc, '2026-08-08')).toBe('This Sunday');
    expect(serviceEyebrow(svc, '2026-08-10')).toBe('Last Sunday');
  });
});

describe('currentSeriesTitle', () => {
  it('returns the series of the current service', () => {
    expect(currentSeriesTitle([service({ serviceDate: '2026-08-09' })], '2026-08-07')).toBe(
      'Life in the Spirit',
    );
  });

  it('is null when the current service has no series', () => {
    const svc = service({ serviceDate: '2026-08-09', seriesTitle: null });
    expect(currentSeriesTitle([svc], '2026-08-07')).toBeNull();
  });
});

describe('starterNoteTitle', () => {
  it('uses the pastor’s title', () => {
    expect(starterNoteTitle(service({ serviceDate: '2026-08-09' }))).toBe('No Condemnation');
  });

  it('falls back to the passage when the service has no title yet', () => {
    expect(starterNoteTitle(service({ serviceDate: '2026-08-09', title: '   ' }))).toBe(
      'Romans 8:1-11',
    );
  });

  it('falls back to a generic label for a titleless topical Sunday', () => {
    expect(
      starterNoteTitle(service({ serviceDate: '2026-08-09', title: '', reference: null })),
    ).toBe('Sermon notes');
  });
});

describe('buildStarterContent', () => {
  const starter = {
    templateId: 'ntpl_sermon',
    templateName: 'Sermon Notes',
    title: 'Sermon Notes',
    content: '<h2>Big idea</h2><p></p>',
  };

  it('puts a pending scripture pill ahead of the template body', () => {
    const html = buildStarterContent(
      service({ serviceDate: '2026-08-09', starter }),
      'ESV',
    );
    // "pending" is what processScriptureReferences resolves into a real pill
    // on /api/notes/create — without it the reference stays dead text.
    expect(html).toContain('data-note-id="pending"');
    expect(html).toContain('Romans 8:1-11');
    expect(html).toContain('ESV');
    expect(html.indexOf('data-scripture-reference')).toBeLessThan(html.indexOf('Big idea'));
  });

  it('works with a passage and no template', () => {
    const html = buildStarterContent(service({ serviceDate: '2026-08-09' }), 'NET');
    expect(html).toContain('data-scripture-reference="Romans 8:1-11"');
    expect(html).not.toContain('Big idea');
  });

  it('works with a template and no passage (a topical Sunday)', () => {
    const html = buildStarterContent(
      service({ serviceDate: '2026-08-09', reference: null, starter }),
      'NET',
    );
    expect(html).toContain('Big idea');
    expect(html).not.toContain('data-scripture-reference');
  });

  it('never returns an empty document', () => {
    const html = buildStarterContent(
      service({ serviceDate: '2026-08-09', reference: null }),
      'NET',
    );
    expect(html.trim()).not.toBe('');
  });
});
