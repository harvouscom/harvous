import { describe, it, expect } from 'vitest';
import {
  SERVICE_GRACE_DAYS,
  buildStarterContent,
  currentSeriesTitle,
  currentSermonFor,
  formatServiceTime,
  formatServiceTimes,
  nextOccurrenceOfDay,
  sermonEyebrow,
  planVocabulary,
  planSermonNoteLink,
  seriesAccent,
  sermonTimeLabel,
  starterFolderForSermon,
  starterNoteTitle,
  weekdayLabel,
  type ChurchSermon,
} from '../church-services';

function service(overrides: Partial<ChurchSermon> & { serviceDate: string }): ChurchSermon {
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

describe('currentSermonFor', () => {
  const sunday = service({ serviceDate: '2026-08-09' });
  const nextSunday = service({ serviceDate: '2026-08-16', title: 'Led by the Spirit' });

  it('prefers the soonest upcoming service', () => {
    const current = currentSermonFor([sunday, nextSunday], '2026-08-05');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('counts today as upcoming, so Sunday morning still shows Sunday', () => {
    const current = currentSermonFor([sunday, nextSunday], '2026-08-09');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('skips past services when a future one exists', () => {
    const current = currentSermonFor([sunday, nextSunday], '2026-08-10');
    expect(current?.serviceDate).toBe('2026-08-16');
  });

  it('falls back to the most recent past service inside the grace window', () => {
    // Monday: the church has not entered next week yet, and this is exactly
    // when someone writes up Sunday.
    const current = currentSermonFor([sunday], '2026-08-10');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('still shows a service on day 4 after', () => {
    const current = currentSermonFor([sunday], '2026-08-13');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('shows nothing on day 5 after', () => {
    expect(currentSermonFor([sunday], '2026-08-14')).toBeNull();
  });

  it('returns null for an empty plan', () => {
    expect(currentSermonFor([], '2026-08-09')).toBeNull();
  });

  it('does not rely on input ordering', () => {
    const current = currentSermonFor([nextSunday, sunday], '2026-08-05');
    expect(current?.serviceDate).toBe('2026-08-09');
  });

  it('ignores malformed dates rather than throwing', () => {
    const bad = service({ serviceDate: 'not-a-date' });
    expect(currentSermonFor([bad, sunday], '2026-08-05')?.serviceDate).toBe('2026-08-09');
  });
});

describe('sermonEyebrow', () => {
  // 2026-08-09 is a Sunday.
  it('reads "Today" on the day itself', () => {
    expect(sermonEyebrow({ serviceDate: '2026-08-09' }, '2026-08-09')).toBe('Today');
  });

  it('reads "This Sunday" in the run-up', () => {
    expect(sermonEyebrow({ serviceDate: '2026-08-09' }, '2026-08-07')).toBe('This Sunday');
  });

  it('reads "Last Sunday" after it passes', () => {
    expect(sermonEyebrow({ serviceDate: '2026-08-09' }, '2026-08-10')).toBe('Last Sunday');
  });

  it('does not call a service three weeks out "This Sunday"', () => {
    // A small lie here makes the whole card untrustworthy.
    expect(sermonEyebrow({ serviceDate: '2026-08-30' }, '2026-08-05')).toBe('Sunday, Aug 30');
  });

  it('uses the service’s real weekday, so a midweek study is not called Sunday', () => {
    // 2026-08-12 is a Wednesday.
    expect(sermonEyebrow({ serviceDate: '2026-08-12' }, '2026-08-10')).toBe('This Wednesday');
  });

  it('a Saturday viewer and a Monday viewer read the same service differently', () => {
    const svc = { serviceDate: '2026-08-09' };
    expect(sermonEyebrow(svc, '2026-08-08')).toBe('This Sunday');
    expect(sermonEyebrow(svc, '2026-08-10')).toBe('Last Sunday');
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

describe('starterFolderForSermon', () => {
  it('uses the series as the folder', () => {
    expect(starterFolderForSermon(service({ serviceDate: '2026-08-09' }))).toBe(
      'Life in the Spirit',
    );
  });

  it('is null for a one-off Sunday', () => {
    // A folder of one is worse than the person's own auto-folder.
    expect(
      starterFolderForSermon(service({ serviceDate: '2026-08-09', seriesTitle: null })),
    ).toBeNull();
    expect(
      starterFolderForSermon(service({ serviceDate: '2026-08-09', seriesTitle: '   ' })),
    ).toBeNull();
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

describe('nextOccurrenceOfDay', () => {
  /** The exact formula the service editor hardcoded before meeting defaults existed. */
  function legacyNextSunday(from: Date): string {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  it('matches the old nextSunday() for day 0, from every weekday', () => {
    // The regression that matters: a church with no configured day must keep
    // getting exactly the date the editor used to offer.
    for (let offset = 0; offset < 7; offset++) {
      const from = new Date(2026, 7, 3 + offset); // Mon Aug 3 2026 onward
      expect(nextOccurrenceOfDay(0, from), from.toDateString()).toBe(legacyNextSunday(from));
    }
  });

  it('counts today as the next occurrence', () => {
    const wednesday = new Date(2026, 7, 5); // Wed Aug 5 2026
    expect(wednesday.getDay()).toBe(3);
    expect(nextOccurrenceOfDay(3, wednesday)).toBe('2026-08-05');
  });

  it('wraps to next week when the day has passed', () => {
    const friday = new Date(2026, 7, 7); // Fri Aug 7 2026
    expect(nextOccurrenceOfDay(3, friday)).toBe('2026-08-12'); // the coming Wednesday
  });

  it('crosses month and year boundaries', () => {
    expect(nextOccurrenceOfDay(3, new Date(2026, 7, 30))).toBe('2026-09-02');
    expect(nextOccurrenceOfDay(5, new Date(2026, 11, 30))).toBe('2027-01-01');
  });

  it('falls back to Sunday for a null or out-of-range day', () => {
    const monday = new Date(2026, 7, 3);
    const sunday = nextOccurrenceOfDay(0, monday);
    for (const bad of [null, undefined, -1, 7, 2.5, NaN]) {
      expect(nextOccurrenceOfDay(bad as number | null | undefined, monday)).toBe(sunday);
    }
  });

  it('survives a DST spring-forward week as plain calendar arithmetic', () => {
    // US DST began Sun Mar 8 2026; the answer is a calendar day, not an instant.
    expect(nextOccurrenceOfDay(0, new Date(2026, 2, 4))).toBe('2026-03-08');
  });
});

describe('formatServiceTime', () => {
  it('renders a 12-hour clock with a meridiem', () => {
    expect(formatServiceTime('10:30')).toBe('10:30 AM');
    expect(formatServiceTime('09:00')).toBe('9:00 AM');
    expect(formatServiceTime('18:00')).toBe('6:00 PM');
    expect(formatServiceTime('23:45')).toBe('11:45 PM');
  });

  it('gets the two midnight/noon edges right', () => {
    expect(formatServiceTime('00:15')).toBe('12:15 AM');
    expect(formatServiceTime('12:00')).toBe('12:00 PM');
    expect(formatServiceTime('12:30')).toBe('12:30 PM');
    expect(formatServiceTime('00:00')).toBe('12:00 AM');
  });

  it('returns null for anything that is not a padded HH:MM', () => {
    for (const bad of [null, undefined, '', '9:30', '24:00', '10:60', 'noon', '1030']) {
      expect(formatServiceTime(bad), String(bad)).toBeNull();
    }
  });
});

describe('weekdayLabel', () => {
  it('names each weekday and falls back to Sunday', () => {
    expect(weekdayLabel(0)).toBe('Sunday');
    expect(weekdayLabel(3)).toBe('Wednesday');
    expect(weekdayLabel(6)).toBe('Saturday');
    for (const bad of [null, undefined, -1, 7, 1.5]) {
      expect(weekdayLabel(bad as number | null)).toBe('Sunday');
    }
  });
});

describe('across different dates, time never overrides the calendar', () => {
  it('picks the sooner date even when the later one starts earlier in the day', () => {
    // Time only breaks ties *within* a date; it never reaches across days.
    const services = [
      service({ serviceDate: '2026-08-09', serviceTimes: ['18:00'] }),
      service({ serviceDate: '2026-08-16', serviceTimes: ['08:00'] }),
    ];
    expect(currentSermonFor(services, '2026-08-05')?.serviceDate).toBe('2026-08-09');
  });
});

describe('formatServiceTimes', () => {
  it('renders a single time', () => {
    expect(formatServiceTimes(['10:45'])).toBe('10:45 AM');
  });

  it('joins two morning services under one meridiem', () => {
    // One sermon at both services reads as "come to either", not as two things.
    expect(formatServiceTimes(['09:00', '10:45'])).toBe('9:00 & 10:45 AM');
  });

  it('keeps both meridiems when they differ', () => {
    expect(formatServiceTimes(['10:45', '18:00'])).toBe('10:45 AM & 6:00 PM');
  });

  it('is null for none, and skips malformed entries', () => {
    expect(formatServiceTimes([])).toBeNull();
    expect(formatServiceTimes(null)).toBeNull();
    expect(formatServiceTimes(['nope'])).toBeNull();
    expect(formatServiceTimes(['nope', '09:00'])).toBe('9:00 AM');
  });
});

describe('planVocabulary', () => {
  it('calls the church plan a sermon', () => {
    expect(planVocabulary({ onSpacePlan: false }).addLabel).toBe('Add a sermon');
  });

  it('calls a shared space a gathering', () => {
    const v = planVocabulary({ onSpacePlan: true, planKind: 'gathering' });
    expect(v.addLabel).toBe('Add a gathering');
    expect(v.itemNoun).toBe('gathering');
  });

  it('calls a channel content — it publishes, it does not meet', () => {
    const v = planVocabulary({ onSpacePlan: true, planKind: 'content' });
    expect(v.addLabel).toBe('Add content');
    expect(v.emptyWritable).not.toContain('gathering');
    expect(v.emptyWritable).not.toContain('sermon');
  });

  it('reads an absent kind as a gathering, for payloads cached before it shipped', () => {
    expect(planVocabulary({ onSpacePlan: true }).addLabel).toBe('Add a gathering');
  });

  it("never offers a channel the church's own wording", () => {
    const church = planVocabulary({ onSpacePlan: false });
    const channel = planVocabulary({ onSpacePlan: true, planKind: 'content' });
    expect(channel.addLabel).not.toBe(church.addLabel);
    expect(channel.emptyWritable).not.toBe(church.emptyWritable);
  });

  it('does not call a churchless room a ministry', () => {
    // "Ministry" is a church's word for a room. A Tuesday book club is not one.
    const v = planVocabulary({ onSpacePlan: true, planKind: 'gathering', hasChurch: false });
    expect(v.addLabel).toBe('Add a gathering');
    expect(v.emptyWritable).not.toContain('ministry');
    expect(v.emptyWritable).not.toContain('church');
  });

  it('keeps the ministry wording when there is a church', () => {
    // Absent `hasChurch` has to read as "has one": every payload cached before
    // churchless plans shipped came from a church room.
    expect(planVocabulary({ onSpacePlan: true, planKind: 'gathering' }).emptyWritable).toContain(
      'ministry',
    );
    expect(
      planVocabulary({ onSpacePlan: true, planKind: 'gathering', hasChurch: true }).emptyWritable,
    ).toContain('ministry');
  });
});

describe('sermonTimeLabel', () => {
  const slots = [
    { id: 'cstm_morning', startTime: '09:00' },
    { id: 'cstm_late', startTime: '10:45' },
    { id: 'cstm_evening', startTime: '18:00' },
  ];

  it('resolves slot ids to clock readings', () => {
    expect(
      sermonTimeLabel({ serviceTimeIds: ['cstm_morning', 'cstm_late'], serviceTime: null }, slots),
    ).toBe('9:00 & 10:45 AM');
  });

  it('sorts slots by time regardless of the order they were checked', () => {
    expect(
      sermonTimeLabel({ serviceTimeIds: ['cstm_late', 'cstm_morning'], serviceTime: null }, slots),
    ).toBe('9:00 & 10:45 AM');
  });

  it('falls back to a one-off time only when no usual service is claimed', () => {
    expect(sermonTimeLabel({ serviceTimeIds: [], serviceTime: '17:00' }, slots)).toBe('5:00 PM');
    // A slot wins: the one-off would be a stale leftover in that case.
    expect(sermonTimeLabel({ serviceTimeIds: ['cstm_evening'], serviceTime: '17:00' }, slots)).toBe(
      '6:00 PM',
    );
  });

  it('is null for an undated idea, which claims no slots and no clock', () => {
    expect(sermonTimeLabel({ serviceTimeIds: [], serviceTime: null }, slots)).toBeNull();
  });

  it('ignores slot ids the plan does not know — a space plan has none', () => {
    expect(sermonTimeLabel({ serviceTimeIds: ['cstm_morning'], serviceTime: null }, [])).toBeNull();
  });
});

describe('currentSermonFor with two sermons on one date', () => {
  const morning = service({ serviceDate: '2026-08-09', title: 'Morning', serviceTimes: ['09:00', '10:45'] });
  const evening = service({ serviceDate: '2026-08-09', title: 'Evening', serviceTimes: ['18:00'] });

  it('shows the morning sermon before it has started', () => {
    const pick = currentSermonFor([morning, evening], '2026-08-09', { date: '2026-08-09', time: '07:30' });
    expect(pick?.title).toBe('Morning');
  });

  it('switches to the evening sermon once the morning has passed', () => {
    const pick = currentSermonFor([morning, evening], '2026-08-09', { date: '2026-08-09', time: '12:00' });
    expect(pick?.title).toBe('Evening');
  });

  it('stays on the evening sermon after it too has started', () => {
    // The one just gone beats the one long gone — you write up what you heard.
    const pick = currentSermonFor([morning, evening], '2026-08-09', { date: '2026-08-09', time: '20:00' });
    expect(pick?.title).toBe('Evening');
  });

  it('uses the church clock, not the viewer date, to decide "started"', () => {
    // Viewer is a day ahead; the church is still on Sunday morning.
    const pick = currentSermonFor([morning, evening], '2026-08-09', { date: '2026-08-09', time: '06:00' });
    expect(pick?.title).toBe('Morning');
  });

  it('prefers the earliest when no church clock is available', () => {
    // No timezone set, or a payload cached before churchNow shipped.
    expect(currentSermonFor([evening, morning], '2026-08-09', null)?.title).toBe('Morning');
  });

  it('does not apply the started-yet rule to a future date', () => {
    // Next Sunday's evening service has not "already started" on Wednesday.
    const pick = currentSermonFor([morning, evening], '2026-08-05', { date: '2026-08-05', time: '23:00' });
    expect(pick?.title).toBe('Morning');
  });

  it('keeps a timeless sermon out of the way of a timed one', () => {
    const timeless = service({ serviceDate: '2026-08-09', title: 'Timeless' });
    expect(currentSermonFor([timeless, morning], '2026-08-09', null)?.title).toBe('Morning');
    expect(currentSermonFor([morning, timeless], '2026-08-09', null)?.title).toBe('Morning');
  });
});

describe('seriesAccent', () => {
  const PALETTE = ['blue', 'purple', 'orange', 'green', 'pink'];

  it('uses the colour a pastor chose', () => {
    expect(seriesAccent({ id: 'csrs_1', color: 'pink' })).toBe('pink');
  });

  it('derives a stable colour when none was chosen', () => {
    // Stability is the whole contract: a run that changes colour between two
    // renders reads as two different studies.
    const first = seriesAccent({ id: 'csrs_romans' });
    expect(PALETTE).toContain(first);
    expect(seriesAccent({ id: 'csrs_romans' })).toBe(first);
    expect(seriesAccent({ id: 'csrs_romans', color: null })).toBe(first);
  });

  it('ignores a colour outside the palette rather than drawing nothing', () => {
    // A token written before the palette last changed must not resolve to a
    // CSS class that does not exist — fall back to the derived colour.
    const derived = seriesAccent({ id: 'csrs_1' });
    expect(seriesAccent({ id: 'csrs_1', color: 'chartreuse' })).toBe(derived);
    // Paper and cream are out of the palette for contrast reasons, so a stored
    // one of those is treated the same way.
    expect(seriesAccent({ id: 'csrs_1', color: 'paper' })).toBe(derived);
    expect(seriesAccent({ id: 'csrs_1', color: 'yellow' })).toBe(derived);
  });

  it('never returns paper or cream', () => {
    for (let i = 0; i < 60; i += 1) {
      const color = seriesAccent({ id: `csrs_${i}` });
      expect(PALETTE).toContain(color);
    }
  });

  it('separates ids that differ only by order', () => {
    // A plain character sum would collide these, handing two series in the
    // same plan one colour — which is the one thing the derivation must not do.
    expect(seriesAccent({ id: 'csrs_ab' })).not.toBe(seriesAccent({ id: 'csrs_ba' }));
  });

  it('spreads a realistic set of ids across the palette', () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => seriesAccent({ id: `csrs_series_${i}` })),
    );
    // Not a distribution proof — just that it is not effectively constant,
    // which a bad hash (or a mod against the wrong length) would make it.
    expect(seen.size).toBeGreaterThan(2);
  });

  it('does not throw on a missing series', () => {
    expect(PALETTE).toContain(seriesAccent(null));
    expect(PALETTE).toContain(seriesAccent(undefined));
  });
});

describe('planSermonNoteLink', () => {
  const serviceId = 'svc_1';

  it('emits nothing when the pick did not move', () => {
    // A no-op write would still invalidate the plan and refetch for free.
    expect(planSermonNoteLink({ previousNoteId: 'n1', nextNoteId: 'n1', serviceId })).toEqual([]);
    expect(planSermonNoteLink({ previousNoteId: null, nextNoteId: null, serviceId })).toEqual([]);
  });

  it('links when nothing was picked before', () => {
    expect(planSermonNoteLink({ previousNoteId: null, nextNoteId: 'n1', serviceId })).toEqual([
      { noteId: 'n1', serviceId },
    ]);
  });

  it('clears when the pick is removed', () => {
    expect(planSermonNoteLink({ previousNoteId: 'n1', nextNoteId: null, serviceId })).toEqual([
      { noteId: 'n1', serviceId: null },
    ]);
  });

  it('unlinks the old note BEFORE linking the new one', () => {
    /*
      The whole reason this function exists. `plannedForServiceId` is a column
      on Notes, so linking n2 without clearing n1 leaves both stamped, and
      resolveViewerPlannedNotes reports whichever row came back first — with no
      ORDER BY to make that stable. Both writes succeed and nothing errors, so
      the failure is silent.
    */
    expect(planSermonNoteLink({ previousNoteId: 'n1', nextNoteId: 'n2', serviceId })).toEqual([
      { noteId: 'n1', serviceId: null },
      { noteId: 'n2', serviceId },
    ]);
  });

  it('keeps the clear first even when order is the only difference', () => {
    const actions = planSermonNoteLink({ previousNoteId: 'n1', nextNoteId: 'n2', serviceId });
    expect(actions[0].serviceId).toBeNull();
    expect(actions[1].serviceId).toBe(serviceId);
  });
});
