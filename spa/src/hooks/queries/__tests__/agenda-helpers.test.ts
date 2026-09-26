import { describe, expect, it } from 'vitest';
import { agendaItemsFromGuide, agendaTotalMinutes } from '../useStudyPlanLeaderKit';

describe('agenda helpers', () => {
  it('adds a step’s questions once, skipping ones already there', () => {
    const existing = [{ text: 'Welcome', minutes: 5 }, { text: 'What stood out?', minutes: null }];
    expect(agendaItemsFromGuide(existing, ['What stood out?', '  Where do you see yourself? ', ''])).toEqual([
      { text: 'Where do you see yourself?', minutes: null },
    ]);
  });
  it('totals only the lines with minutes', () => {
    expect(agendaTotalMinutes([{ text: 'a', minutes: 5 }, { text: 'b', minutes: null }, { text: 'c', minutes: 30 }])).toBe(35);
    expect(agendaTotalMinutes([])).toBe(0);
  });
});
