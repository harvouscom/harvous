import { describe, expect, it } from 'vitest';
import { deriveReferenceFromPassageSelection } from '@/utils/derive-passage-selection-reference';

describe('deriveReferenceFromPassageSelection', () => {
  it('narrows to selected verse numbers', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><sup class="verse-num">16</sup>For God so loved the world <sup class="verse-num">17</sup>For God did not send</p>';

    const range = document.createRange();
    const verse16 = root.querySelector('sup.verse-num')!;
    range.setStartBefore(verse16);
    range.setEndAfter(verse16.nextSibling!);

    const ref = deriveReferenceFromPassageSelection(root, range, 'John 3:16-17');
    expect(ref).toBe('John 3:16');
  });

  it('falls back when no verse markers intersect', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>Plain text without markers</p>';
    const range = document.createRange();
    range.selectNodeContents(root);
    expect(deriveReferenceFromPassageSelection(root, range, 'John 3:16')).toBe('John 3:16');
  });
});
