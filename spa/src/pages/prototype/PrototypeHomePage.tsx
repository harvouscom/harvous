import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeInstallWebAppCard from './PrototypeInstallWebAppCard';
import PrototypeStudyFeedPage from './PrototypeStudyFeedPage';
import PrototypeChurchHub from './PrototypeChurchHub';
import PrototypeSpaceHub from './PrototypeSpaceHub';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { resolveMainPaneSurface } from '../../layouts/resolve-main-pane-surface';
import { readSharedSpaceDashboardFixtureMode } from '../dev/shared-spaces-design/shared-space-dashboard-fixture-mode';

/**
 * The main pane on `/`.
 *
 * Was an empty state — the pane stood vacant until a note was opened, because Home lived in
 * the sidebar. Activity takes the canvas instead: opening the app now shows what has been
 * happening in someone's study rather than an invitation to go find it.
 *
 * And now it takes a second answer. `/` has always meant "the parent's own hub" — that is what
 * `ProtoLocation`'s `spaceId: null` says — but only My Home's hub had somewhere to be, so a
 * church fell through to the personal feed and lived entirely on the rail. The branch is one
 * line here and a pure resolver next door, so the church hub is a *location* rather than a
 * sidebar variant, and the rail can eventually go without taking it along.
 *
 * Composing on `/` still renders the hosted editor instead of this, in the layout — see
 * `hostNoteInLayout` in SimplifiedPrototypeLayout.
 */
export default function PrototypeHomePage() {
  const { location } = useProtoShell();
  const { isSharedSpace } = useActiveSpace();
  /*
   * The design gallery's fixture mode used to reach the space hub through the sidebar variant
   * resolver, which is where it was routed when the hub lived in the rail. The hub is on the
   * canvas now, so the fixture follows it here — and the check stays out of
   * `resolveMainPaneSurface`, which is a pure function over a location and should not learn to
   * read sessionStorage to keep a dev tool working.
   */
  const fixtureMode = readSharedSpaceDashboardFixtureMode();
  const surface = fixtureMode
    ? ('space-hub' as const)
    : resolveMainPaneSurface({ location, isSharedSpace });

  if (surface === 'space-hub') {
    /*
     * A shared space's own surface, where the personal feed used to sit.
     *
     * This is the fix for the oddest thing the canvas did: standing in a shared space, it
     * rendered *your* Continue, Following and Suggested — your study, under someone else's
     * roof — because the feed only ever asked which day it was showing, never whose.
     */
    return (
      <PrototypeMainPaneShell>
        <div className="proto-hub-frame">
          <PrototypeSpaceHub />
        </div>
      </PrototypeMainPaneShell>
    );
  }

  if (surface === 'church-hub') {
    /*
     * No install card here. It is an invitation to keep your own study to hand, which is a My
     * Home thought — a catalog of a church's rooms is not where someone decides to add the app
     * to their home screen.
     */
    return (
      <PrototypeMainPaneShell>
        <div className="proto-hub-frame">
          <PrototypeChurchHub />
        </div>
      </PrototypeMainPaneShell>
    );
  }

  return (
    <PrototypeMainPaneShell>
      <PrototypeInstallWebAppCard />
      <PrototypeStudyFeedPage />
    </PrototypeMainPaneShell>
  );
}
