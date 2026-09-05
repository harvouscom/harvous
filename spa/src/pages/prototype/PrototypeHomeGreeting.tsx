/**
 * The greeting — a person's study, said as one sentence with the facts as chips.
 *
 * Lifted out of `PrototypeSidebarHomeView` when Activity became the app's first screen and
 * needed the same opening. It is the warmest thing in the product precisely because it is a
 * sentence: "27 notes" inside one is a fact about a person, where the same number in a stat
 * block is a metric.
 *
 * Navigation arrives as props rather than being reached for here. The sidebar's chips open
 * sidebar lists; the same chips on a day sheet have to do something the sheet can do. One
 * component, two sets of destinations, and neither surface has to know about the other's.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import Icon, { type IconName } from '@/components/react/Icon';
import { useProfile } from '../../hooks/queries/useProfile';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import {
  computeActivityRhythm,
  computeLastActivityTime,
  countWeeklyActivityDays,
  formatHomeActivityLeadSuffix,
  formatHomeNoteCount,
  greetingForHour,
  homeLeadCopyLayout,
  type HomeLeadTheme,
  type RecallTrendGreetingParts,
} from '@/utils/prototype-home-trends';
import { currentLiturgicalSeason } from '@/utils/liturgical-season';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import { protoRelativeCaption } from './proto-time';
import { recallKindIcon } from './recall-kind-icons';
import { HOME_INTRO_LIST_MODES, type SidebarListModeEntry } from './proto-sidebar-list-modes';
import type { SidebarListMode } from '../../layouts/proto-shell-context';

/** The greeting's closing clause — a trend the recall engine surfaced, as a tappable chip. */
export type HomeGreetingTrend = {
  kind: 'arc' | 'subject' | 'passage' | 'crossref' | 'referenceWord';
  parts: RecallTrendGreetingParts;
  onOpen: () => boolean | void;
  /**
   * Whether `onOpen` would actually go somewhere. False renders the same words as a plain
   * label rather than a chip: several of these handlers bail silently — an arc whose notes
   * are not on the loaded page, a connection short of its minimum, a proposal with nowhere
   * to land — and a pill that looks pressable and does nothing reads as a broken app.
   */
  openable?: boolean;
};

/** Where a greeting chip goes — supplied by whichever surface is showing the sentence. */
export type HomeGreetingNav = {
  openList: (mode: SidebarListMode) => void;
  openThread: (threadId: string) => void;
  openFolder: (folderName: string) => void;
  /** The notes with no folder, ready to be filed — not the list of folders they lack. */
  openUnfiledNotes: () => void;
  openTag: (tagId: string, tagName: string) => void;
  openScriptureBook: (bookOrder: number) => void;
};

export default function PrototypeHomeGreeting({
  notes,
  countForLogic,
  hasMoreForLogic,
  lead,
  trend,
  trailing,
  nav,
  onOpenTodaysPassage,
}: {
  notes: SpaceNoteRow[];
  countForLogic: number;
  hasMoreForLogic: boolean;
  lead: HomeLeadTheme;
  trend?: HomeGreetingTrend;
  /** A further sentence about the same moment, joined to the greeting's paragraph. */
  trailing?: ReactNode;
  nav: HomeGreetingNav;
  /** The welcome sentence's "Today's Passage" — a chip when the surface can open the reader. */
  onOpenTodaysPassage?: () => void;
}) {
  const { user } = useUser();
  const { data: profile } = useProfile();

  const firstName = useMemo(
    () => resolveProfileFirstName(user, profile),
    [user, profile],
  );

  const rhythm = useMemo(() => computeActivityRhythm(notes), [notes]);
  const weeklyDays = useMemo(() => countWeeklyActivityDays(notes, new Date()), [notes]);
  const lastActivityMs = useMemo(() => computeLastActivityTime(notes), [notes]);
  const season = useMemo(() => currentLiturgicalSeason(new Date()), []);

  const hello = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
  const activityTail = useMemo(
    () =>
      formatHomeActivityLeadSuffix({
        rhythm,
        weeklyDays,
        lastActivityMs,
        now: new Date(),
        totalNoteCount: countForLogic,
      }),
    [rhythm, weeklyDays, lastActivityMs, countForLogic],
  );
  const activityClause = activityTail ? <>, {activityTail}</> : null;

  const trendClause = trend ? (
    <>
      {trend.parts.prefix}
      {trend.parts.labels.map((label, i) => {
        const isPassage = trend.kind === 'passage';
        const chipClass = isPassage
          ? 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage'
          : 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--thread';
        /* Passage chips keep `book`: at 11px the shelf's scroll glyph is a smudge. Every other
           kind takes the shelf's own icon, so a cross-reference named in the greeting and one
           sitting in the list below it are the same thing to look at. */
        const iconName: IconName = isPassage ? 'book' : recallKindIcon(trend.kind);
        const iconSize = isPassage ? 11 : 10;
        return (
          <Fragment key={`${label}-${i}`}>
            {i > 0 ? ' and ' : null}
            {trend.openable === false ? (
              /* Same words, same glass, no press — the chip styling's hover and cursor are
                 keyed on `button`, so a span is the honest version of it. */
              <span className={chipClass}>
                <Icon name={iconName} size={iconSize} aria-hidden />
                <span>{label}</span>
              </span>
            ) : (
              <button
                type="button"
                className={chipClass}
                aria-label={`Open ${label}`}
                onClick={trend.onOpen}
              >
                <Icon name={iconName} size={iconSize} aria-hidden />
                <span>{label}</span>
              </button>
            )}
          </Fragment>
        );
      })}
      {trend.parts.suffix}
    </>
  ) : null;

  const sentenceEnd = (
    <>
      {activityClause}
      {trendClause}.
    </>
  );

  const singleNoteAddedRel = useMemo(() => {
    if (countForLogic !== 1 || hasMoreForLogic || notes.length === 0) return '';
    const note = notes[0];
    return protoRelativeCaption(note.updatedAt ?? note.createdAt ?? null);
  }, [notes, countForLogic, hasMoreForLogic]);

  const countChip = (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
      aria-label="View notes list"
      onClick={() => {
        nav.openList('notes');
      }}
    >
      <span>{formatHomeNoteCount(countForLogic, hasMoreForLogic)}</span>
    </button>
  );

  /* A label, not a button. A future recall pass may resurface notes from this season, and
     until it does a pill that presses and does nothing is worse than one that does not press. */
  const seasonLine = season ? (
    <span className="proto-glass-surface proto-home-greeting__season">
      <Icon name="calendar" size={11} aria-hidden />
      <span>{season.label}</span>
    </span>
  ) : null;

  // Brand new space — keep it warm, the empty-state card below carries the CTA.
  if (countForLogic === 0) {
    const introModeByKey = Object.fromEntries(
      HOME_INTRO_LIST_MODES.map((entry) => [entry.mode, entry]),
    ) as Record<SidebarListMode, SidebarListModeEntry | undefined>;

    const introListChip = (mode: SidebarListMode) => {
      const entry = introModeByKey[mode];
      if (!entry) return null;
      const chipClass =
        mode === 'scripture'
          ? 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage'
          : 'proto-glass-surface proto-home-greeting__chip';
      return (
        <button
          type="button"
          className={chipClass}
          aria-label={`Open ${entry.label} list`}
          onClick={() => {
            nav.openList(mode);
          }}
        >
          <Icon name={entry.icon} size={10} aria-hidden />
          <span>{entry.label}</span>
        </button>
      );
    };

    /* It sits between four chips in one sentence, so it has to be one too — plain text
       there read as a chip that did not work. */
    const todaysPassageChip = onOpenTodaysPassage ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage"
        aria-label="Open Today's Passage"
        onClick={onOpenTodaysPassage}
      >
        <Icon name="book" size={11} aria-hidden />
        <span>Today&apos;s Passage</span>
      </button>
    ) : (
      <>Today&apos;s Passage</>
    );

    return (
      <>
        <p className="proto-home-greeting">
          <span className="proto-home-greeting__hello">{hello}</span>{' '}
          Welcome to Harvous. Write {introListChip('notes')} as you add{' '}
          {introListChip('scripture')}, open {todaysPassageChip}, and create{' '}
          {introListChip('highlights')} and {introListChip('threads')}.
        </p>
        {seasonLine}
      </>
    );
  }

  const threadChip =
    lead.kind === 'thread' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--thread"
        aria-label={`Open Thread ${lead.thread.title}`}
        onClick={() => {
          const slug = lead.thread.id.startsWith('note_') ? lead.thread.id.slice('note_'.length) : lead.thread.id;
          nav.openThread(slug);
        }}
      >
        <Icon name="arrow-right-arrow-left" size={10} aria-hidden />
        <span>{lead.thread.title}</span>
      </button>
    ) : null;

  const bookChip =
    lead.kind === 'book' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage"
        aria-label={`Open ${lead.book.title} in Scripture`}
        onClick={() => nav.openScriptureBook(lead.book.bookOrder)}
      >
        <Icon name="scroll" size={11} aria-hidden />
        <span>{lead.book.title}</span>
      </button>
    ) : null;

  const folderChip =
    lead.kind === 'folder' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--folder"
        aria-label={`Browse folder ${lead.folder.name}`}
        onClick={() => {
          nav.openFolder(lead.folder.name);
        }}
      >
        <Icon name="folder" size={10} aria-hidden />
        <span>{lead.folder.name}</span>
      </button>
    ) : null;

  const tagChip =
    lead.kind === 'tag' ? (
      <button
        type="button"
        className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--tag"
        aria-label={`Search notes tagged ${lead.tag.name}`}
        onClick={() => nav.openTag(lead.tag.id, lead.tag.name)}
      >
        <Icon name="tag" size={10} aria-hidden />
        <span>{lead.tag.name}</span>
      </button>
    ) : null;

  const layout = homeLeadCopyLayout(lead);
  const subjectChip = threadChip || bookChip || folderChip || tagChip;

  const leadSentence = (() => {
    if (lead.kind === 'book' && lead.tone === 'single-note') {
      return (
        <>
          {layout.beforeChip}
          {bookChip}
          {singleNoteAddedRel ? <> {singleNoteAddedRel}</> : null}.
          {layout.showCount ? (
            <>
              {' '}
              {countChip} saved so far{sentenceEnd}
            </>
          ) : (
            sentenceEnd
          )}
        </>
      );
    }
    if (lead.kind === 'none') {
      return (
        <>
          {layout.beforeChip}
          {countChip}
          {layout.afterChip}
          {sentenceEnd}
        </>
      );
    }
    return (
      <>
        {layout.beforeChip}
        {subjectChip}
        {layout.afterChip}
        {layout.showCount ? (
          <>
            {countChip} saved so far{sentenceEnd}
          </>
        ) : (
          sentenceEnd
        )}
      </>
    );
  })();

  return (
    <>
      <p className="proto-home-greeting">
        <span className="proto-home-greeting__hello">{hello}</span>{' '}
        {leadSentence}
        {/* Inside the paragraph, not after it. A caller with another sentence about the
            same moment — the day sheet's tally of what happened today — is continuing this
            one, and two stacked paragraphs read as two separate claims. A `<p>` cannot
            nest, so the slot has to live here rather than wrapping from outside. */}
        {trailing ? <> {trailing}</> : null}
      </p>
      {seasonLine}
    </>
  );
}
