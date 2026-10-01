import { beforeEach, describe, expect, it, vi } from 'vitest';

const readPackedChapter = vi.fn();
const fetchVerseHtml = vi.fn();

vi.mock('../bible-pack-store', () => ({ readPackedChapter }));
vi.mock('../fetch-verse-html', () => ({
  fetchVerseHtml,
  getCachedVerseHtml: () => null,
}));

const { getVersePeek, truncatePeek, verseHtmlToPeekText } = await import('../verse-peek');

const JOHN_3 = [
  { number: 15, text: 'so that everyone who believes in him may have eternal life.' },
  { number: 16, text: 'For this is the way God loved the world:' },
  { number: 17, text: 'For God did not send his Son into the world to condemn the world,' },
  { number: 18, text: 'The one who believes in him is not condemned.' },
];

beforeEach(() => {
  readPackedChapter.mockReset();
  fetchVerseHtml.mockReset();
});

describe('getVersePeek', () => {
  it('reads the verse from the offline pack without a request', async () => {
    readPackedChapter.mockResolvedValue(JOHN_3);
    expect(await getVersePeek('John 3:16', 'NET')).toBe('For this is the way God loved the world:');
    expect(readPackedChapter).toHaveBeenCalledWith('NET', 'John', 3);
    expect(fetchVerseHtml).not.toHaveBeenCalled();
  });

  it('joins a range from the pack', async () => {
    readPackedChapter.mockResolvedValue(JOHN_3);
    expect(await getVersePeek('John 3:16-17', 'ESV')).toBe(
      'For this is the way God loved the world: For God did not send his Son into the world to condemn the world,',
    );
  });

  it('takes a cross-chapter range from its start chapter onward', async () => {
    readPackedChapter.mockResolvedValue(JOHN_3);
    const peek = await getVersePeek('John 3:18-4:2', 'NIV');
    expect(peek).toBe('The one who believes in him is not condemned.');
  });

  it('falls back to the network when the pack does not have the book', async () => {
    readPackedChapter.mockResolvedValue(null);
    fetchVerseHtml.mockResolvedValue(
      '<p><sup class="verse-num" style="x">28</sup>And we know that all things work together for good.</p>',
    );
    expect(await getVersePeek('Romans 8:28', 'NET')).toBe('And we know that all things work together for good.');
  });

  it('shows nothing when the translation leaves the verse out', async () => {
    readPackedChapter.mockResolvedValue(null);
    fetchVerseHtml.mockResolvedValue('<p><em>This verse is not included in the NIV translation.</em></p>');
    expect(await getVersePeek('Mark 16:9', 'NIV')).toBeNull();
  });

  it('shows nothing when both sources fail', async () => {
    readPackedChapter.mockRejectedValue(new Error('blocked'));
    fetchVerseHtml.mockResolvedValue(null);
    expect(await getVersePeek('Acts 1:1', 'NET')).toBeNull();
  });

  it('remembers a peek for the session', async () => {
    readPackedChapter.mockResolvedValue(JOHN_3);
    await getVersePeek('John 3:15', 'KJV');
    readPackedChapter.mockReset();
    expect(await getVersePeek('John 3:15', 'KJV')).toBe(
      'so that everyone who believes in him may have eternal life.',
    );
    expect(readPackedChapter).not.toHaveBeenCalled();
  });
});

describe('verseHtmlToPeekText', () => {
  it('drops verse numbers, chapter chips and tags, and decodes entities', () => {
    const html =
      '<p class="passage-chapter-verses"><sup class="verse-num">1</sup>In the beginning &amp; the end</p>' +
      '<p class="passage-chapter-heading"><span>CH 2</span></p>' +
      '<p class="passage-chapter-verses"><sup class="verse-num">1</sup>Thus&nbsp;the heavens</p>';
    expect(verseHtmlToPeekText(html)).toBe('In the beginning & the end Thus the heavens');
  });
});

describe('truncatePeek', () => {
  it('leaves short text alone', () => {
    expect(truncatePeek('Jesus wept.')).toBe('Jesus wept.');
  });

  it('cuts long text at a word and adds an ellipsis', () => {
    const long = 'word '.repeat(60);
    const out = truncatePeek(long, 40);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).not.toMatch(/\s…$/);
  });
});
