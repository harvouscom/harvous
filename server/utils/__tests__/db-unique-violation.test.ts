import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../db-unique-violation';

const NAME = 'ChurchServiceTimes_church_day_time_unique';

describe('isUniqueViolation', () => {
  it('finds the constraint on a wrapped driver error', () => {
    // The shape Drizzle actually throws: the wrapper's message is the SQL, and
    // the constraint name is only on the cause. Matching the wrapper's text —
    // which is what `String(error).includes(...)` did — never sees it.
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
      constraint_name: NAME,
    });
    const wrapped = Object.assign(new Error('Failed query: insert into "ChurchServiceTimes" ...'), {
      cause,
    });
    expect(isUniqueViolation(wrapped, NAME)).toBe(true);
    expect(String(wrapped).includes(NAME)).toBe(false);
  });

  it('accepts the pg spelling of the field too', () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('dup'), { constraint: NAME }),
    });
    expect(isUniqueViolation(wrapped, NAME)).toBe(true);
  });

  it('still matches when the name is in a message', () => {
    expect(isUniqueViolation(new Error(`violates unique constraint "${NAME}"`), NAME)).toBe(true);
  });

  it('walks more than one level of cause', () => {
    const deep = Object.assign(new Error('outer'), {
      cause: Object.assign(new Error('middle'), {
        cause: Object.assign(new Error('inner'), { constraint_name: NAME }),
      }),
    });
    expect(isUniqueViolation(deep, NAME)).toBe(true);
  });

  it('says no for a different constraint, and for non-errors', () => {
    const other = Object.assign(new Error('x'), {
      cause: Object.assign(new Error('y'), { constraint_name: 'SomethingElse_unique' }),
    });
    expect(isUniqueViolation(other, NAME)).toBe(false);
    expect(isUniqueViolation(null, NAME)).toBe(false);
    expect(isUniqueViolation('a string', NAME)).toBe(false);
  });

  it('terminates on a self-referencing cause rather than hanging', () => {
    const loop: { cause?: unknown; message: string } = { message: 'loop' };
    loop.cause = loop;
    expect(isUniqueViolation(loop, NAME)).toBe(false);
  });
});
