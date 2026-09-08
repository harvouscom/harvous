/**
 * The sample card: what a free account is shown, and what it is not.
 *
 * The thing to protect is that this is a real question — gaps to fill, a mark, the verse
 * after — and not a picture of one. And that the verse stays hidden until the question is
 * over, on the same attempt rule as the paid feature.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const mutate = vi.fn();
const seePlus = vi.fn();
const notNow = vi.fn();
vi.mock('../../../hooks/mutations/useReviewMutations', () => ({
  useAnswerReviewSample: () => ({ mutate, isPending: false }),
}));

const PrototypeReviewSample = (await import('../PrototypeReviewSample')).default;

const sample = {
  reference: 'John 15:5',
  source: 'yours' as const,
  cloze: {
    segments: ['I am the vine; you are the ', '. The one who ', ' in me bears much fruit.'],
    blankLengths: [8, 7],
  },
  blankCount: 2,
};

beforeEach(() => {
  mutate.mockReset();
  seePlus.mockReset();
  notNow.mockReset();
});

describe('the sample card', () => {
  it('says whose verse it is, and puts an input in each gap', () => {
    render(<PrototypeReviewSample sample={sample} day="2026-09-03" maxAttempts={2} onSeePlus={seePlus} onNotNow={notNow} />);
    expect(screen.getByText(/From your own study/)).toBeTruthy();
    expect(screen.getByText(/John 15:5/)).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    // Nothing of the answer is on the page: the segments are the visible pieces only.
    expect(document.body.textContent).not.toContain('branches');
    expect(document.body.textContent).not.toContain('remains');
  });

  it('names a well-known verse honestly rather than calling it the reader own', () => {
    render(<PrototypeReviewSample sample={{ ...sample, source: 'well-known' }} day="2026-09-03" maxAttempts={2} onSeePlus={seePlus} onNotNow={notNow} />);
    expect(screen.getByText(/A verse to try it on/)).toBeTruthy();
    expect(screen.queryByText(/From your own study/)).toBeNull();
  });

  it('will not check until every gap has something in it', () => {
    render(<PrototypeReviewSample sample={sample} day="2026-09-03" maxAttempts={2} onSeePlus={seePlus} onNotNow={notNow} />);
    const check = screen.getByRole('button', { name: /check/i }) as HTMLButtonElement;
    expect(check.disabled).toBe(true);
    const [first, second] = screen.getAllByRole('textbox');
    fireEvent.change(first, { target: { value: 'branches' } });
    expect(check.disabled).toBe(true);
    fireEvent.change(second, { target: { value: 'remains' } });
    expect(check.disabled).toBe(false);
    fireEvent.click(check);
    expect(mutate).toHaveBeenCalledWith(
      { day: '2026-09-03', words: ['branches', 'remains'], attemptNumber: 1 },
      expect.anything(),
    );
  });

  it('keeps the question up on a miss with a go left, and shows the verse only at the end', () => {
    render(<PrototypeReviewSample sample={sample} day="2026-09-03" maxAttempts={2} onSeePlus={seePlus} onNotNow={notNow} />);
    const [first, second] = screen.getAllByRole('textbox');
    fireEvent.change(first, { target: { value: 'a' } });
    fireEvent.change(second, { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    // The server says: wrong, one go left.
    act(() => mutate.mock.calls[0][1].onSuccess({ correct: false, finalized: false, attemptsLeft: 1 }));
    expect(screen.getByText(/One more go/)).toBeTruthy();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    // The hidden words stay hidden: only the visible pieces are on the page.
    expect(document.body.textContent).not.toContain('branches');

    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(mutate.mock.calls[1][0].attemptNumber).toBe(2);
    act(() =>
      mutate.mock.calls[1][1].onSuccess({
        correct: false,
        finalized: true,
        reference: 'John 15:5',
        verseText: '<p>I am the vine; you are the branches. The one who remains in me bears much fruit.</p>',
      }),
    );
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.body.textContent).toContain('branches');
    expect(screen.getByText(/brings your own study back/)).toBeTruthy();
  });

  it('makes the offer only once the reader has answered, and offers both ways out', () => {
    /*
     * A paywall above an untried thing asks someone to buy a description. The same words under
     * a question they have just answered are about something that happened to them — so the
     * offer waits, and "Not now" is a real answer to it.
     */
    render(<PrototypeReviewSample sample={sample} day="2026-09-03" maxAttempts={3} onSeePlus={seePlus} onNotNow={notNow} />);
    expect(screen.queryByRole('button', { name: /see plus/i })).toBeNull();

    const [first, second] = screen.getAllByRole('textbox');
    fireEvent.change(first, { target: { value: 'branches' } });
    fireEvent.change(second, { target: { value: 'remains' } });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    act(() =>
      mutate.mock.calls[0][1].onSuccess({
        correct: true,
        finalized: true,
        verseText: '<p>I am the vine; you are the branches.</p>',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /see plus/i }));
    expect(seePlus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(notNow).toHaveBeenCalledTimes(1);
  });
});
