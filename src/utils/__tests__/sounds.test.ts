import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const play = vi.fn();
const setTheme = vi.fn();
const setVolume = vi.fn();
vi.mock('cuelume', () => ({ play, setTheme, setVolume }));

import { playSound, resetSoundsForTests, warmSounds } from '../sounds';
import { resetSoundPreferenceForTests, writeSoundPreference } from '../sound-prefs';

/** The synth loads as a dynamic import; let it land before asserting on what it played. */
async function loaded() {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

function gesture(type: 'pointerup' | 'pointerdown' | 'click' = 'pointerup') {
  document.dispatchEvent(new Event(type));
}

function key(repeat = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', repeat }));
}

/** What was played, minus the inaudible primes the gesture listener makes. */
function heard() {
  return play.mock.calls.filter(([, options]) => options?.volume !== 0.0001);
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  localStorage.clear();
  resetSoundPreferenceForTests();
  resetSoundsForTests();
  setVisibility('visible');
  play.mockClear();
  setTheme.mockClear();
  setVolume.mockClear();
  warmSounds();
  await loaded();
  play.mockClear();
});

afterEach(() => {
  resetSoundsForTests();
  vi.useRealTimers();
});

describe('the palette', () => {
  it('loads the warm material at half level', () => {
    expect(setTheme).toHaveBeenCalledWith('default');
    expect(setVolume).toHaveBeenCalledWith(0.5);
  });

  it('plays each moment as its own cue', () => {
    playSound('review.right');
    playSound('review.almost');
    playSound('review.miss');
    playSound('review.sittingDone');
    expect(heard().map(([sound, options]) => [sound, options.emphasis])).toEqual([
      ['success', 'subtle'],
      ['ready', 'subtle'],
      ['error', 'subtle'],
      ['success', 'strong'],
    ]);
  });

  it('plays a try-again quieter than the miss it resembles', () => {
    playSound('review.tryAgain');
    expect(heard()[0]).toEqual(['error', expect.objectContaining({ emphasis: 'subtle', volume: 0.6 })]);
  });

  it('turns back with the same whoosh, played backwards', async () => {
    gesture();
    playSound('nav.back');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard()[0]).toEqual([
      'navigate',
      expect.objectContaining({ direction: 'back', emphasis: 'subtle', volume: 0.7 }),
    ]);
  });
});

describe('the reader’s choice', () => {
  it('keeps the interface quiet on Moments only, and still plays the moments', async () => {
    writeSoundPreference('moments');
    gesture();
    playSound('nav.open');
    playSound('review.right');
    await vi.advanceTimersByTimeAsync(400);
    expect(heard().map(([sound]) => sound)).toEqual(['success']);
  });

  it('plays nothing at all when off', async () => {
    writeSoundPreference('off');
    gesture();
    playSound('review.right');
    playSound('nav.open');
    await vi.advanceTimersByTimeAsync(400);
    expect(heard()).toEqual([]);
  });

  it('lets Hear it play through Off', () => {
    writeSoundPreference('off');
    playSound('review.right', { force: true });
    expect(heard().map(([sound]) => sound)).toEqual(['success']);
  });

  it('plays nothing while the page is hidden', () => {
    setVisibility('hidden');
    playSound('review.right');
    expect(heard()).toEqual([]);
  });
});

describe('the interface only sounds when someone touched it', () => {
  it('stays silent with no gesture behind it', async () => {
    playSound('nav.open');
    await vi.advanceTimersByTimeAsync(100);
    expect(heard()).toEqual([]);
  });

  it('stays silent when the gesture was too long ago to have caused it', async () => {
    gesture();
    await vi.advanceTimersByTimeAsync(700);
    playSound('nav.open');
    await vi.advanceTimersByTimeAsync(100);
    expect(heard()).toEqual([]);
  });

  it('counts a press, so a control that acts on mousedown is heard', async () => {
    gesture('pointerdown');
    playSound('nav.open');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['open']);
  });

  it('never gates a moment: those arrive after the server answers', () => {
    playSound('space.created');
    expect(heard().map(([sound]) => sound)).toEqual(['success']);
  });
});

describe('one sound per gesture', () => {
  it('plays the more meaningful of two interface sounds from the same tap', async () => {
    gesture();
    playSound('nav.close');
    playSound('nav.forward');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['navigate']);
  });

  it('keeps the first of two equal ones', async () => {
    gesture();
    playSound('nav.open');
    playSound('nav.close');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['open']);
  });

  it('lets a moment cancel the interface sound waiting behind it', async () => {
    gesture();
    playSound('nav.close');
    playSound('space.created');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['success']);
  });

  it('keeps the interface hushed just after a moment', async () => {
    playSound('space.created');
    gesture();
    playSound('nav.forward');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['success']);

    await vi.advanceTimersByTimeAsync(300);
    gesture();
    playSound('nav.forward');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['success', 'navigate']);
  });
});

describe('echoes', () => {
  it('hears the same interface sound once when two parts of one close both play it', async () => {
    gesture();
    playSound('nav.close');
    await vi.advanceTimersByTimeAsync(200);
    playSound('nav.close');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['close']);
  });

  it('hears it again once the moment has passed', async () => {
    gesture();
    playSound('nav.close');
    await vi.advanceTimersByTimeAsync(450);
    gesture();
    playSound('nav.close');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard().map(([sound]) => sound)).toEqual(['close', 'close']);
  });
});

describe('a held key', () => {
  it('drops interface sounds from key repeat', async () => {
    key(true);
    playSound('nav.open');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard()).toEqual([]);
  });

  it('still ticks through a list, but no faster than it can be heard', async () => {
    key(true);
    playSound('nav.select');
    await vi.advanceTimersByTimeAsync(50);
    key(true);
    playSound('nav.select');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(100);
    key(true);
    playSound('nav.select');
    await vi.advanceTimersByTimeAsync(50);
    expect(heard()).toHaveLength(2);
  });
});

describe('unlocking audio inside a gesture', () => {
  const primes = () => play.mock.calls.filter(([, options]) => options?.volume === 0.0001);

  it('primes on the way up, not on the press', () => {
    gesture('pointerdown');
    expect(primes()).toHaveLength(0);
    gesture('pointerup');
    expect(primes()).toEqual([['tap', { volume: 0.0001 }]]);
  });

  it('primes at most every thirty seconds', async () => {
    gesture();
    gesture();
    key();
    expect(primes()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_001);
    gesture();
    expect(primes()).toHaveLength(2);
  });

  it('primes again on coming back to the page, which iOS suspended', () => {
    gesture();
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    gesture();
    expect(primes()).toHaveLength(2);
  });

  it('does not prime while sounds are off', () => {
    writeSoundPreference('off');
    gesture();
    expect(primes()).toHaveLength(0);
  });

  it('asks Safari to mix under other audio, once', () => {
    const session = { type: 'auto' };
    (navigator as Navigator & { audioSession?: { type: string } }).audioSession = session;
    resetSoundsForTests();
    warmSounds();
    return loaded().then(() => {
      playSound('review.right');
      expect(session.type).toBe('ambient');
      session.type = 'playback';
      playSound('review.right');
      expect(session.type).toBe('playback');
      delete (navigator as Navigator & { audioSession?: unknown }).audioSession;
    });
  });
});

describe('loading', () => {
  it('does not download the synth while sounds are off, unless asked to', async () => {
    resetSoundsForTests();
    writeSoundPreference('off');
    setTheme.mockClear();
    warmSounds();
    await loaded();
    expect(setTheme).not.toHaveBeenCalled();
    warmSounds({ force: true });
    await loaded();
    expect(setTheme).toHaveBeenCalledWith('default');
  });
});
