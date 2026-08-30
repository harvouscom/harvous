/**
 * A quiet line in Activity saying the app changed, and where to read about it.
 *
 * It sits in Activity's "Following" group with the church feed and the reading plan, because
 * that is where things from Harvous live rather than things from your own study.
 *
 * ## Why there is no dismiss control
 *
 * It started with a trailing × like the founder letter's, and lost it: a plain chevron row —
 * the same shape as "12 notes need a folder" — carries one action, and this row only has one.
 * Opening the notes already counts as having seen the release, so a separate × was a second
 * control for an outcome the first one reaches. The cost is real and worth naming: the only
 * way to put this row away is to open it. That is tolerable because it puts itself away
 * anyway, at the next release, and never accumulates.
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
 * ## Why the link is the index and not this version's page
 *
 * The site publishes a page per version, which would be the better destination if it always
 * existed. It does not: the app's version bumps on every commit, so a build is routinely
 * ahead of what has been published — `/release-notes/v2-96-1/` was a 404 while the newest
 * published page was `v2-87-2`. A notice whose whole job is to point somewhere cannot point
 * at a 404, so it points at the list, which is never wrong and is newest-first anyway.
 */
import { useCallback } from 'react';
import PrototypeHomeRow from './PrototypeHomeRow';
import { RELEASE_NOTES_INDEX_URL } from '@/utils/release-notes-url';
import {
  PROTO_WHATS_NEW_DISMISSED_KEY,
  PROTO_WHATS_NEW_PREVIEW_KEY,
} from '../../layouts/proto-session-keys';
import { useDismissibleRelease } from './useDismissibleFlag';

function appVersion(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { __APP_VERSION__?: string }).__APP_VERSION__;
}

export default function PrototypeWhatsNewPill() {
  const version = appVersion();
  const [visible, dismiss] = useDismissibleRelease(PROTO_WHATS_NEW_DISMISSED_KEY, version, {
    previewKey: PROTO_WHATS_NEW_PREVIEW_KEY,
  });

  /* Reading the notes is also an answer, so it counts as having seen this release. Without
     this the row would still be sitting there when you came back from reading it. */
  const open = useCallback(() => {
    window.open(RELEASE_NOTES_INDEX_URL, '_blank', 'noopener,noreferrer');
    dismiss();
  }, [dismiss]);

  if (!visible) return null;

  return (
    <PrototypeHomeRow
      icon="burst"
      title="What's new in Harvous"
      aria-label="Read the release notes for this release"
      onClick={open}
    />
  );
}
