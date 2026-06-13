import { describe, expect, it } from 'vitest';
import { computeEaster, currentLiturgicalSeason } from '../liturgical-season';

describe('computeEaster', () => {
  it('matches known Gregorian Easter dates', () => {
    expect(computeEaster(2024)).toEqual({ month: 3, day: 31 });
    expect(computeEaster(2025)).toEqual({ month: 4, day: 20 });
    expect(computeEaster(2026)).toEqual({ month: 4, day: 5 });
    expect(computeEaster(2027)).toEqual({ month: 3, day: 28 });
  });
});

describe('currentLiturgicalSeason', () => {
  const at = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d, 12, 0, 0);

  it('returns null during Ordinary Time', () => {
    expect(currentLiturgicalSeason(at(2026, 7, 15))).toBeNull();
    expect(currentLiturgicalSeason(at(2026, 2, 10))).toBeNull(); // before Lent 2026 (Ash Wed Feb 18)
  });

  it('marks Christmas season and Christmas Day', () => {
    expect(currentLiturgicalSeason(at(2026, 12, 25))).toEqual({ key: 'christmas', label: 'Christmas Day' });
    expect(currentLiturgicalSeason(at(2026, 12, 28))).toEqual({ key: 'christmas', label: 'Christmas season' });
    expect(currentLiturgicalSeason(at(2026, 1, 3))).toEqual({ key: 'christmas', label: 'Christmas season' });
  });

  it('marks Epiphany on Jan 6', () => {
    expect(currentLiturgicalSeason(at(2026, 1, 6))).toEqual({ key: 'epiphany', label: 'Epiphany' });
  });

  it('marks Lent and Ash Wednesday (Easter 2026 = Apr 5, Ash Wed = Feb 18)', () => {
    expect(currentLiturgicalSeason(at(2026, 2, 18))).toEqual({ key: 'lent', label: 'Ash Wednesday' });
    expect(currentLiturgicalSeason(at(2026, 3, 1))).toEqual({ key: 'lent', label: 'Lent' });
  });

  it('marks Holy Week with its special days', () => {
    expect(currentLiturgicalSeason(at(2026, 3, 29))).toEqual({ key: 'holy-week', label: 'Palm Sunday' });
    expect(currentLiturgicalSeason(at(2026, 4, 2))).toEqual({ key: 'holy-week', label: 'Maundy Thursday' });
    expect(currentLiturgicalSeason(at(2026, 4, 3))).toEqual({ key: 'holy-week', label: 'Good Friday' });
    expect(currentLiturgicalSeason(at(2026, 3, 31))).toEqual({ key: 'holy-week', label: 'Holy Week' });
  });

  it('marks Easter Sunday, Eastertide, Ascension, and Pentecost', () => {
    expect(currentLiturgicalSeason(at(2026, 4, 5))).toEqual({ key: 'easter', label: 'Easter Sunday' });
    expect(currentLiturgicalSeason(at(2026, 4, 12))).toEqual({ key: 'easter', label: 'Easter season' });
    expect(currentLiturgicalSeason(at(2026, 5, 14))).toEqual({ key: 'easter', label: 'Ascension' }); // Easter +39
    expect(currentLiturgicalSeason(at(2026, 5, 24))).toEqual({ key: 'pentecost', label: 'Pentecost' }); // Easter +49
  });

  it('marks Advent weeks (2026 Advent begins Nov 29)', () => {
    expect(currentLiturgicalSeason(at(2026, 11, 29))).toEqual({ key: 'advent', label: '1st week of Advent' });
    expect(currentLiturgicalSeason(at(2026, 12, 6))).toEqual({ key: 'advent', label: '2nd week of Advent' });
    expect(currentLiturgicalSeason(at(2026, 12, 24))).toEqual({ key: 'advent', label: '4th week of Advent' });
  });
});
