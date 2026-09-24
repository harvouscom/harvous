import { describe, expect, it } from 'vitest';
import { shouldSearchVerseText } from '../useScriptureVerseSearch';

describe('shouldSearchVerseText', () => {
  it('searches words once the query is long enough', () => {
    expect(shouldSearchVerseText('love your enemies')).toBe(true);
    expect(shouldSearchVerseText('go')).toBe(false);
  });

  it('leaves a reference to the passage row', () => {
    expect(shouldSearchVerseText('John 3:16')).toBe(false);
    expect(shouldSearchVerseText('Romans 8')).toBe(false);
  });
});
