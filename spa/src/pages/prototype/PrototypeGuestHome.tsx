/**
 * Home, for someone with no account — an activity sheet like every other day's.
 *
 * The first version of this was a centred empty state: an icon, a paragraph explaining what
 * Activity would do for them one day, and a button. It read as a wall in front of the app
 * rather than as part of it, and everything on it was about a feature they did not have.
 *
 * A guest *does* have activity — the verses they highlighted and the notes they wrote are
 * sitting on this device — so the honest surface is the same paper the feed uses, showing the
 * same thing it would show. Then "keep this" is a sentence about the list they are looking at,
 * which is the only version of that offer worth making.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeHomeRow from './PrototypeHomeRow';
import PrototypeOnboardingDock from './PrototypeOnboardingDock';
import PrototypeHomeSection from './PrototypeHomeSection';
import PrototypeFounderLetterPill from './PrototypeFounderLetterPill';
import { prototypeReadTodayRouteTo, prototypeReadRouteTo } from '@/lib/prototype-path';
import {
  guestHighlights,
  guestStoreServerSnapshot,
  guestStoreSnapshot,
  subscribeToGuestStore,
} from '../../lib/guest-store';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import { bookSlug } from '@/utils/bible-book-chapters';
import { takeOnboardingStep } from './onboarding-step-handoff';

export default function PrototypeGuestHome() {
  const navigate = useNavigate();
  // Re-render on every local write, so a highlight made a moment ago is already listed here.
  useSyncExternalStore(subscribeToGuestStore, guestStoreSnapshot, guestStoreServerSnapshot);
  const highlights = guestHighlights();
  const openReader = () => navigate({ to: prototypeReadTodayRouteTo() });

  /*
   * A checklist row pressed from the toolbar, anywhere in the app, is performed on arrival —
   * the same handoff Activity uses. Every step a guest can reach ends at the reader (a note is
   * written on a verse, from the annotate dock), so there is one destination rather than the
   * switch Home needs; consumed once either way, so it cannot fire again on the next visit.
   */
  useEffect(() => {
    if (takeOnboardingStep()) navigate({ to: prototypeReadTodayRouteTo(), replace: true });
    // Mount only: a later render is a later visit, not the arrival this was handed off for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PrototypeMainPaneShell>
      {/*
        The same two wrappers a signed-in Activity uses. The sheet alone is just the paper's
        contents — `.proto-feed` and `.proto-feed-stack` are what give it the card it sits on,
        so without them a guest's Home was the right rows on no surface at all. No edges inside
        the stack: those are the days behind today, and a guest has none.
      */}
      <div className="proto-feed">
        <div className="proto-feed-stack">
      <article className="proto-feed-sheet proto-guest-home__sheet">
        <header className="proto-feed-sheet__head">
          <div className="proto-feed-sheet__title">
            {/*
              Not "Today" — that is the feed's day label, and it is the one word here that means
              nothing to a guest: no stack of days behind this sheet, nothing dated on it. Not
              "Your study" either, which was the first attempt and claims too much of someone
              who has been here ninety seconds. This page is an introduction, so it says so.
            */}
            <h2 className="proto-feed-sheet__day">This is Harvous</h2>
          </div>
        </header>

        <div className="proto-feed-sheet__body">
          {highlights.length > 0 ? (
            <section className="proto-home-section">
              <div className="proto-guest-home__section-head">
                <p className="proto-caption proto-guest-home__eyebrow">
                  On this device
                  <span className="proto-guest-home__count">{highlights.length}</span>
                </p>
                {/*
                  The offer sits on the list rather than under a paragraph about the list. It is
                  the same accent button as everywhere else, and it is the only control here.
                */}
                <button
                  type="button"
                  className="proto-accent-btn-sm"
                  onClick={() => {
                    leaveForSignUp();
                    window.location.href = guestSignUpHref();
                  }}
                >
                  Keep these
                </button>
              </div>
              <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel">
                {highlights
                  .slice()
                  .reverse()
                  .map((highlight) => (
                    <PrototypeHomeRow
                      key={highlight.id}
                      icon={highlight.miniNoteBody?.trim() ? 'note-sticky' : 'highlighter'}
                      title={highlight.reference}
                      /* Their words if they wrote any, the verse if they did not — the row
                         should show the thing they would recognise it by. */
                      meta={[highlight.miniNoteBody?.trim() || highlight.excerpt]}
                      onClick={() =>
                        navigate({
                          to: prototypeReadRouteTo(),
                          params: {
                            book: bookSlug(highlight.book),
                            chapter: String(highlight.chapter),
                          },
                          search: { t: highlight.translation },
                        })
                      }
                    />
                  ))}
              </div>
            </section>
          ) : (
            <section className="proto-home-section proto-guest-home__intro">
              <p className="proto-guest-home__lead">
                Harvous keeps what stands out to you in Scripture. Start by reading.
              </p>
              <button type="button" className="proto-settings-btn" onClick={openReader}>
                <Icon name="book-open" size={13} aria-hidden />
                &nbsp;Open today&rsquo;s passage
              </button>
            </section>
          )}

          <PrototypeOnboardingDock onStepAction={openReader} />

          {/*
            Why the app exists, for the person deciding whether to care.

            The letter is the strongest thing on this page for a visitor and it costs nothing to
            offer: `GET /api/about/founder-letter` carries no auth, so it reads for a guest
            exactly as it does for a member — and the pill brings its own dismissed flag, so
            putting it away here is the same gesture, remembered the same way.

            Below the checklist rather than above it. The checklist is what to *do*; this is why
            it is worth doing, and someone who wants the reasons will scroll for them.
          */}
          <PrototypeHomeSection title="About">
            <PrototypeFounderLetterPill />
          </PrototypeHomeSection>
        </div>
      </article>
        </div>
      </div>
    </PrototypeMainPaneShell>
  );
}
