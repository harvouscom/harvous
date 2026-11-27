import { describe, expect, it } from 'vitest';
import { joinPosterSvg, posterNameLines } from '../church-join-poster';

const QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" width="176" height="176"><path d="M0 0h7v7H0z"/></svg>';

describe('join poster', () => {
  it('carries what the pane previews: the line, the church, the code and the address', () => {
    const svg = joinPosterSvg({ churchName: 'New Hope Assembly of God Church', qrSvg: QR, url: 'https://harvo.us/j/abc123' });
    expect(svg).toContain('Scan to join on Harvous');
    expect(svg).toContain('New Hope Assembly of');
    expect(svg).toContain('harvo.us/j/abc123');
    expect(svg).not.toContain('https://');
    // The QR stays vector, sized by the poster rather than the server's 176px.
    expect(svg).toContain('<path d="M0 0h7v7H0z"/>');
    expect(svg).toMatch(/<svg x="240" y="\d+" width="720" height="720" xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 29 29">/);
  });

  it('escapes a church name', () => {
    expect(joinPosterSvg({ churchName: 'St. Mark & <John>', qrSvg: QR, url: 'x' })).toContain('St. Mark &amp; &lt;John&gt;');
  });

  it('wraps a long name to three lines at most', () => {
    expect(posterNameLines('Grace Church')).toEqual(['Grace Church']);
    const lines = posterNameLines('The First Evangelical Free Church of the Greater Des Moines Metropolitan Area');
    expect(lines).toHaveLength(3);
    expect(lines[2]!.endsWith('…')).toBe(true);
  });
});
