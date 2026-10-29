import { describe, expect, it } from 'vitest';
import { passageSelectionText } from '@/utils/passage-selection-text';

describe('passageSelectionText', () => {
  const root = () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<h3 class="passage-chapter-heading">Exodus 33</h3>' +
      '<p>milk and honey. <sup class="verse-num">3</sup>Go up<span class="sr-only">, printed as</span> to this land</p>' +
      '<p>When the people heard</p>';
    document.body.append(el);
    return el;
  };

  it('leaves out verse numerals, headings and screen-reader-only text a drag crossed', () => {
    const el = root();
    const range = document.createRange();
    range.selectNodeContents(el);
    expect(passageSelectionText(range, el)).toBe('milk and honey. Go up to this land When the people heard');
    el.remove();
  });

  it('clips the first and last text nodes to the selection offsets', () => {
    const el = root();
    const first = el.querySelector('p')!.firstChild as Text; // "milk and honey. "
    const last = el.querySelectorAll('p')[1]!.firstChild as Text; // "When the people heard"
    const range = document.createRange();
    range.setStart(first, 5);
    range.setEnd(last, 8);
    expect(passageSelectionText(range, el)).toBe('and honey. Go up to this land When the');
    el.remove();
  });

  it("'paint' concatenates text nodes exactly, the way the highlight painter indexes them", () => {
    const el = root();
    const range = document.createRange();
    range.selectNodeContents(el);
    expect(passageSelectionText(range, el, 'paint')).toBe('milk and honey. Go up to this landWhen the people heard');
    el.remove();
  });
});
