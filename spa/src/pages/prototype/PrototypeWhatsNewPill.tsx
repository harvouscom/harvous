/**
 * A quiet line in Activity saying the app changed, and where to read about it.
 *
 * It sits in Activity's "Following" group with the church feed and the reading plan, because
 * that is where things from Harvous live rather than things from your own study.
 *
 * ## Putting it away is its own action
 *
 * It carries the same trailing pair as Today's passage: a shortcut to the second destination,
 * and an × that removes it. Opening no longer counts as having read it.
 *
 * This is a reversal. The row previously had one control and dismissed itself when you used
 * it, on the reasoning that reading the notes is already an answer and a separate × would be
 * a second control for an outcome the first one reaches. That argument holds only while the
 * row has one destination. Once it had two — the sheet and the notes — using one of them
 * could no longer stand for having dealt with the row, and a row that vanishes when you were
 * only glancing at half of it is worse than one that waits to be told.
 *
 * ## What dismissing means
 *
 * *This* release, not all of them. The founder letter is one message said once, so it
 * dismisses forever; this is a channel with something different to say each time, and a
 * boolean would have turned the first close into an unsubscribe from every future one. Hence
 * `useDismissibleRelease`.
 *
 * ## Why it is one line
 *
 * A title and nothing else, like "12 notes need a folder" two groups below it. It carried a
 * second line twice — first the version number, which is the one fact about a release nobody
 * reads for interest, then a one-clause summary of what changed. Both made this the only row
 * in the group wearing more furniture than its neighbours, for a row whose whole job is to be
 * a quiet way out to somewhere else. The version still prints in Settings, which is the one
 * audience that ever needs it.
 *
 * ## Where it goes
 *
 * On 3.0 it opens the welcome sheet rather than leaving for the site. That release renamed the
 * three surfaces people navigate by, so the useful answer to "what's new" is the one that
 * explains the rearrangement, and the sheet carries links to both the release page and the
 * notes anyway. This row then doubles as the way back to a modal that otherwise shows itself
 * exactly once — the sheet had no re-entry, and this row had no home for a release big enough
 * to need one.
 *
 * Every other release goes straight out to the notes, as it always has: the sheet is about
 * 3.0 specifically, and pointing a 3.4 notice at "Harvous 3 is here." would be a lie told by a
 * component that had stopped being maintained. It reverts on its own.
 *
 * ## Which notes
 *
 * This version's own page when the site has one, the index when it does not. It used to be the
 * index always, because the app's version bumps on every commit and a build is routinely ahead
 * of what has been published — a notice whose whole job is to point somewhere cannot point at a
 * 404. The site now publishes which versions exist (`/release-notes/published.json`), so the
 * question is answerable and the specific page is offered only once it is known to be there.
 */
import { appVersion } from '@/utils/app-version';
import { releaseMarkerFor } from '@/utils/release-marker';
import { useCallback } from 'react';
import Icon from '@/components/react/Icon';
import PrototypeHomeRow from './PrototypeHomeRow';
import { useReleaseNotesUrl } from '../../hooks/useReleaseNotesUrl';
import {
  PROTO_WHATS_NEW_DISMISSED_KEY,
  PROTO_WHATS_NEW_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useDismissibleRelease } from './useDismissibleFlag';
import { openWelcome3 } from './welcome3-bridge';

/** The one release with a sheet of its own. */
const WELCOME_SHEET_RELEASE = '3.0';

export default function PrototypeWhatsNewPill() {
  const version = appVersion();
  const releaseNotesUrl = useReleaseNotesUrl(version);
  const [visible, dismiss] = useDismissibleRelease(PROTO_WHATS_NEW_DISMISSED_KEY, version, {
    previewKey: PROTO_WHATS_NEW_PREVIEW_KEY,
  });

  const showsWelcomeSheet = releaseMarkerFor(version) === WELCOME_SHEET_RELEASE;

  /* `releaseNotesUrl` belongs in the deps: it starts on the index and upgrades in place once
     the site answers, so a callback that captured only the first value would have pinned every
     click to the index and quietly wasted the lookup. */
  const openNotes = useCallback(() => {
    window.open(releaseNotesUrl, '_blank', 'noopener,noreferrer');
  }, [releaseNotesUrl]);

  const open = useCallback(() => {
    if (showsWelcomeSheet) openWelcome3();
    else openNotes();
  }, [openNotes, showsWelcomeSheet]);

  if (!visible) return null;

  return (
    <PrototypeHomeRow
      icon="burst"
      title="What's new in Harvous"
      aria-label={showsWelcomeSheet ? 'See what is new in Harvous 3' : 'Read the release notes'}
      onClick={open}
      trailing={
        <>
          {/* Only where the row itself goes somewhere else. On every other release the row is
              already the notes, and this would be a button that repeats it. */}
          {showsWelcomeSheet ? (
            <button
              type="button"
              className="proto-side-panel__action-btn"
              aria-label="Read the release notes"
              title="Release notes"
              onClick={openNotes}
            >
              <Icon name="list" size={12} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            className="proto-side-panel__action-btn"
            aria-label="Dismiss what's new"
            title="Not now"
            onClick={dismiss}
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </>
      }
    />
  );
}
