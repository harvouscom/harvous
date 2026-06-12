import { describe, expect, it } from 'vitest';
import {
  applyAutoCollectionAfterEdit,
  type CollectionChromeState,
} from '../bible-study-collection-web';
import {
  applyIdleFolderAutoAssign,
  plainBodyForFolderSnapshot,
} from '../prototype-folder-auto-assign';
import { shouldAllowPrimaryFolderUpdate } from '../should-allow-primary-folder-update';

const emptyChrome: CollectionChromeState = {
  primaryCollection: null,
  secondaryCollections: [],
  collectionPinned: false,
  collectionUserOverride: false,
  collectionLastAutoUpdatedAtIso: null,
};

const SALVATION_TITLE = '10 years ago';
const SALVATION_BODY =
  '<p>10 years ago I raised my hand during a salvation call at a church I had been going to only a handful of times. ' +
  'I was invited forward and prayed with a pastor named Paul. We talked about Moses, Noah, and Romans afterward. ' +
  'Paul shared how the apostle Paul wrote to the Romans about grace and redemption through Christ.</p>';

function simulateIncrementalTyping(
  title: string,
  fullHtml: string,
  now: Date,
): CollectionChromeState {
  const plainFull = plainBodyForFolderSnapshot(fullHtml);
  const chunks = plainFull.split(/(?<=[.!?])\s+/).filter(Boolean);
  let chrome = emptyChrome;
  let snapTitle = '';
  let snapBody = '';

  let builtPlain = '';
  for (let i = 0; i < chunks.length; i++) {
    builtPlain = chunks.slice(0, i + 1).join(' ');
    const partialHtml = `<p>${builtPlain}</p>`;
    const allowPrimary = shouldAllowPrimaryFolderUpdate(snapTitle, title, snapBody, builtPlain);
    chrome = applyAutoCollectionAfterEdit(chrome, title, partialHtml, now, {
      allowPrimaryUpdate: allowPrimary,
    });
    if (allowPrimary) {
      snapTitle = title;
      snapBody = builtPlain;
    }
  }

  return chrome;
}

describe('folder assignment parity — typing vs paste', () => {
  it('idle assignment matches after incremental typing and after one-shot paste', () => {
    const now = new Date('2026-06-11T12:00:00.000Z');

    const pasteIdle = applyIdleFolderAutoAssign(emptyChrome, SALVATION_TITLE, SALVATION_BODY, now);

    const afterIncremental = simulateIncrementalTyping(SALVATION_TITLE, SALVATION_BODY, now);
    const typingIdle = applyIdleFolderAutoAssign(
      afterIncremental,
      SALVATION_TITLE,
      SALVATION_BODY,
      now,
    );

    expect(pasteIdle.primaryCollection).toBe('Salvation');
    expect(typingIdle.primaryCollection).toBe(pasteIdle.primaryCollection);
  });

  it('one-shot paste idle does not depend on incremental partial assignments', () => {
    const now = new Date('2026-06-11T12:00:00.000Z');
    const incrementalOnly = simulateIncrementalTyping(SALVATION_TITLE, SALVATION_BODY, now);
    const pasteIdle = applyIdleFolderAutoAssign(emptyChrome, SALVATION_TITLE, SALVATION_BODY, now);

    // Document prior divergence: partial gates could pick a different primary than idle full text.
    // Idle full-text assignment is canonical for both paths.
    const incrementalIdle = applyIdleFolderAutoAssign(
      incrementalOnly,
      SALVATION_TITLE,
      SALVATION_BODY,
      now,
    );
    expect(incrementalIdle.primaryCollection).toBe(pasteIdle.primaryCollection);
  });
});
