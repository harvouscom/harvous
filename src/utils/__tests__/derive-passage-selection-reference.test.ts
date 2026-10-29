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

  const exodus33 = () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<p><sup class="verse-num">2</sup>Perizzites, Hivites, and Jebusites. ' +
      '<sup class="verse-num">3</sup>Go up to this land that flows with milk and honey. But I will not travel among you, ' +
      'for you are a stubborn and rebellious people. If I did, I would surely destroy you along the way. ' +
      '<sup class="verse-num">4</sup>When the people heard these stern words, they went into mourning. ' +
      '<sup class="verse-num">5</sup>For the Lord had told Moses</p>';
    return root;
  };

  function rangeOver(root: HTMLElement, startText: string, endText: string): Range {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = n as Text;
      const s = t.data.indexOf(startText);
      if (s >= 0 && range.collapsed && range.startContainer === document) range.setStart(t, s);
      const e = t.data.indexOf(endText);
      if (e >= 0) range.setEnd(t, e + endText.length);
    }
    return range;
  }

  it('cites the one verse a mid-verse selection sits in, not the whole dock passage', () => {
    const root = exodus33();
    const range = rangeOver(root, 'But I will not', 'people. If');
    expect(deriveReferenceFromPassageSelection(root, range, 'Exodus 33:1-6')).toBe('Exodus 33:3');
  });

  it('counts the verse a selection starts in when it runs on into later verses', () => {
    const root = exodus33();
    const range = rangeOver(root, 'But I will not', 'had told Moses');
    expect(deriveReferenceFromPassageSelection(root, range, 'Exodus 33:1-6')).toBe('Exodus 33:3-5');
  });

  it('does not count the previous verse when the selection starts on a verse marker', () => {
    const root = exodus33();
    const range = document.createRange();
    const sup4 = root.querySelectorAll('sup.verse-num')[2]!;
    range.setStartBefore(sup4);
    range.setEnd(sup4.nextSibling!, 10);
    expect(deriveReferenceFromPassageSelection(root, range, 'Exodus 33:1-6')).toBe('Exodus 33:4');
  });
});
