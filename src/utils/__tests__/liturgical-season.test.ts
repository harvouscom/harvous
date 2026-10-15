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

describe('currentLiturgicalSeason for Catholic readers', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);
  const label = (y: number, m: number, d: number) => currentLiturgicalSeason(at(y, m, d), { catholic: true })?.label;

  it('counts the weeks of Ordinary Time on both sides of Easter', () => {
    expect(label(2026, 10, 13)).toBe('28th week in Ordinary Time');
    expect(label(2026, 10, 18)).toBe('29th Sunday in Ordinary Time');
    expect(label(2026, 11, 22)).toBe('Christ the King');
    expect(label(2026, 11, 28)).toBe('34th week in Ordinary Time');
    // 2026: Epiphany Sunday Jan 4, Baptism Sunday Jan 11, so the 2nd Sunday is Jan 18.
    expect(label(2026, 1, 12)).toBe('1st week in Ordinary Time');
    expect(label(2026, 1, 18)).toBe('2nd Sunday in Ordinary Time');
  });

  it('runs Christmas to the Baptism of the Lord, with Epiphany on its Sunday', () => {
    expect(label(2026, 1, 4)).toBe('Epiphany');
    expect(label(2026, 1, 6)).toBe('Christmas season');
    expect(label(2026, 1, 11)).toBe('The Baptism of the Lord');
    // 2025: Epiphany Sunday Jan 5 → Baptism Sunday Jan 12. 2020: Epiphany Jan 5 too; 2019: Jan 6.
    // 2030: Epiphany Sunday Jan 6. 2029: Epiphany Sunday Jan 7, so the Baptism is Monday Jan 8.
    expect(label(2029, 1, 8)).toBe('The Baptism of the Lord');
    expect(label(2029, 1, 9)).toBe('1st week in Ordinary Time');
    expect(label(2029, 1, 14)).toBe('2nd Sunday in Ordinary Time');
  });

  it('uses the Roman names in Holy Week and Easter', () => {
    expect(label(2026, 4, 2)).toBe('Holy Thursday');
    expect(label(2026, 4, 4)).toBe('Holy Saturday');
    expect(label(2026, 4, 12)).toBe('Divine Mercy Sunday');
    expect(label(2026, 4, 15)).toBe('2nd week of Easter');
    expect(label(2026, 5, 31)).toBe('Trinity Sunday');
    expect(label(2026, 6, 7)).toBe('Corpus Christi');
  });

  it('names the fixed solemnities, except over a privileged Sunday', () => {
    expect(label(2026, 8, 15)).toBe('The Assumption');
    expect(label(2026, 11, 1)).toBe('All Saints');
    expect(label(2026, 12, 8)).toBe('The Immaculate Conception');
    expect(label(2026, 1, 1)).toBe('Mary, Mother of God');
  });

  it('counts Lent', () => {
    expect(label(2026, 2, 18)).toBe('Ash Wednesday');
    expect(label(2026, 2, 20)).toBe('Lent');
    expect(label(2026, 2, 22)).toBe('1st week of Lent');
  });

  it('leaves the Protestant labels as they were', () => {
    expect(currentLiturgicalSeason(at(2026, 4, 2))?.label).toBe('Maundy Thursday');
    expect(currentLiturgicalSeason(at(2026, 10, 13))).toBeNull();
  });
});
