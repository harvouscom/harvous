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
  guestNotes,
  guestStoreServerSnapshot,
  guestStoreSnapshot,
  subscribeToGuestStore,
} from '../../lib/guest-store';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { guestSignUpHref, leaveForSignUp } from '../../lib/guest-signup';
import { bookSlug } from '@/utils/bible-book-chapters';
import { landAgain, readerRouteForReference } from '../../utils/reader-nav';
import { takeOnboardingStep } from './onboarding-step-handoff';

export default function PrototypeGuestHome() {
  const navigate = useNavigate();
  // Re-render on every local write, so a highlight made a moment ago is already listed here.
  useSyncExternalStore(subscribeToGuestStore, guestStoreSnapshot, guestStoreServerSnapshot);
  const highlights = guestHighlights();
  const notes = guestNotes();
  /*
   * Newest first, and one list rather than two.
   *
   * A note and a highlight are the same kind of thing on this sheet — something you made
   * today — and splitting them into "Notes" and "Highlights" would give a visitor with two
   * items two headings to read. Sorted together by when they were made so the list matches
   * the order they happened in.
   */
  const items = [
    ...highlights.map((h) => ({ kind: 'highlight' as const, at: h.createdAt, highlight: h })),
    ...notes.map((n) => ({ kind: 'note' as const, at: n.updatedAt, note: n })),
  ].sort((a, b) => b.at.localeCompare(a.at));
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
              "Your study" either, which claims too much of someone who has been here ninety
              seconds. The greeting below used to open with these words and the heading said
              something near enough to them; one of the two had to go, and a heading is the
              better place to be welcomed than the middle of a sentence about features.
            */}
            <h2 className="proto-feed-sheet__day">Welcome to Harvous</h2>
          </div>
        </header>

        <div className="proto-feed-sheet__body">
          {/*
            The page opens with what Harvous is, whether or not this browser holds anything yet.

            It used to be the empty state, shown only until the first highlight landed — which
            meant the sentence explaining the app disappeared the moment someone started using
            it, and left the heading sitting on a bare list. Backwards: a guest two minutes in
            is still deciding what this is, and the list below is evidence for the claim rather
            than a replacement for it.
          */}
          <section className="proto-home-section proto-guest-home__intro">
            {/*
              The first-run greeting's shape, for the reader who needs it most.

              `proto-home-greeting` itself rather than a copy of its type — this is the same
              thing it is, the sentence a Home opens with, and the shared-space hub already
              reuses it for exactly that. A second set of matching values is a second set to
              keep matching, and it had already drifted once.

              Pills for the same reason that greeting uses them: three nouns in a row read as
              a list of features, and the same three set in the sentence read as things you
              do. Every one named here is something a guest can actually do today — threads
              and recall are deliberately absent, because naming them would be advertising a
              room this visitor cannot enter.

              Spans, not buttons. The greeting's chips open sidebar lists; a guest has none,
              and a pill that looks pressable and goes nowhere is worse than a pill that
              plainly does not. The button below is the way in.
            */}
            <p className="proto-home-greeting proto-guest-home__lead">
              Read{' '}
              <span className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage">
                <Icon name="book-open" size={10} aria-hidden />
                <span>Scripture</span>
              </span>
              , keep what stands out as{' '}
              <span className="proto-glass-surface proto-home-greeting__chip">
                <Icon name="highlighter" size={10} aria-hidden />
                <span>highlights</span>
              </span>
              , and write{' '}
              <span className="proto-glass-surface proto-home-greeting__chip">
                <Icon name="note-sticky" size={10} aria-hidden />
                <span>notes</span>
              </span>{' '}
              on the verses you want to come back to. Harvous remembers what you studied, for
              later.
            </p>
          </section>

          {items.length > 0 ? (
            <section className="proto-home-section">
              <div className="proto-guest-home__section-head">
                <p className="proto-caption proto-guest-home__eyebrow">
                  On this device
                  <span className="proto-guest-home__count">{items.length}</span>
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
                {items.map((item) =>
                  item.kind === 'note' ? (
                    <PrototypeHomeRow
                      key={item.note.id}
                      icon="note-sticky"
                      title={item.note.title || 'Untitled note'}
                      /* The words, not the markup — the row is how they recognise which note
                         this is, and tags read as gibberish at this size. */
                      meta={[item.note.contentHtml.replace(/<[^>]+>/g, ' ').trim()]}
                      onClick={() =>
                        navigate({
                          to: prototypeNoteRouteTo(),
                          params: { noteId: item.note.id },
                        })
                      }
                    />
                  ) : (
                    <PrototypeHomeRow
                      key={item.highlight.id}
                      icon={item.highlight.miniNoteBody?.trim() ? 'note-sticky' : 'highlighter'}
                      title={item.highlight.reference}
                      /* Their words if they wrote any, the verse if they did not — the row
                         should show the thing they would recognise it by. */
                      meta={[item.highlight.miniNoteBody?.trim() || item.highlight.excerpt]}
                      /*
                        The verse, not just the chapter it lives in.
                        `readerRouteForReference` is what every other highlight-to-reader
                        journey uses — the sidebar's Highlights list, the Home passage card,
                        the note page's scripture dock — and it puts `v`/`vEnd` on the URL,
                        which is what makes the reader focus the verse and dim the rest.
                        Building the route by hand here landed on the chapter with nothing
                        singled out, so a guest tapping their own highlight had to go find it.

                        The stored book and chapter are the fallback rather than a no-op: the
                        reference is a display string, and if one ever fails to parse, opening
                        the right chapter is still most of the answer.
                      */
                      onClick={() => {
                        const target = readerRouteForReference(
                          item.highlight.reference,
                          item.highlight.translation,
                        ) ?? {
                          to: prototypeReadRouteTo(),
                          params: {
                            book: bookSlug(item.highlight.book),
                            chapter: String(item.highlight.chapter),
                          },
                          search: { t: item.highlight.translation },
                        };
                        // Stamped, so tapping the same row twice lands twice — see `landAgain`.
                        navigate(landAgain(target));
                      }}
                    />
                  ),
                )}
              </div>
            </section>
          ) : (
            /*
              Only while there is nothing here yet. Once the list exists, its rows are the way
              back into the reader, and the checklist below still names the next thing to do —
              a third door to the same place would just be one more thing to read past.
            */
            <section className="proto-home-section proto-guest-home__start">
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
