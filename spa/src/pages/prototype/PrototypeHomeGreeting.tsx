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

/**
 * A glyph inside a greeting chip, sized against the chip's own text rather than in pixels.
 *
 * `size` is the pixel size each glyph was drawn at against the chip's original flat 12px, and is
 * kept as that ratio: the chip's type is relative now (it grows with the sentence on the sheet),
 * and a fixed 10–11px glyph beside 17px words read as shrunken.
 */
function ChipIcon({ name, size }: { name: IconName; size: number }) {
  const em = `${size / 12}em`;
  return <Icon name={name} size={size} className="proto-home-greeting__chip-icon" style={{ width: em, height: em }} aria-hidden />;
}
import ProtoDaypartMark, { isDaypart, type Daypart } from './ProtoDaypartMark';
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
  /*
   * "often on Friday nights" gets the hour drawn beside it (`ProtoDaypartMark`). Matched on the
   * rhythm phrase's own shape, so every other tail — "twice this week", "here yesterday" — stays
   * plain words.
   */
  const rhythmMatch = activityTail ? /^often on (\S+) (\S+)$/.exec(activityTail) : null;
  const activityClause = activityTail ? (
    rhythmMatch && isDaypart(rhythmMatch[2]!) ? (
      <>
        , often on <ProtoDaypartMark day={rhythmMatch[1]!} daypart={rhythmMatch[2] as Daypart} />
      </>
    ) : (
      <>, {activityTail}</>
    )
  ) : null;

  const trendClause = trend ? (
    <>
      {trend.parts.prefix}
      {trend.parts.labels.map((label, i) => {
        const isPassage = trend.kind === 'passage';
        /*
         * The Thread class and Thread glyph belong to a Thread that already exists (the lead
         * chip). "lately returning to X" is a theme, so it wears the return glyph and the
         * default chip — same words, not the same thing.
         */
        const chipClass = isPassage
          ? 'proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--passage'
          : 'proto-glass-surface proto-home-greeting__chip';
        const iconName: IconName = isPassage ? 'book' : recallKindIcon(trend.kind);
        const iconSize = isPassage ? 11 : 10;
        return (
          <Fragment key={`${label}-${i}`}>
            {i > 0 ? ' and ' : null}
            {trend.openable === false ? (
              /* Same words, same glass, no press — the chip styling's hover and cursor are
                 keyed on `button`, so a span is the honest version of it. */
              <span className={chipClass}>
                <ChipIcon name={iconName} size={iconSize} />
                <span>{label}</span>
              </span>
            ) : (
              <button
                type="button"
                className={chipClass}
                aria-label={`Open ${label}`}
                onClick={trend.onOpen}
              >
                <ChipIcon name={iconName} size={iconSize} />
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
      <ChipIcon name="calendar" size={11} />
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
          <ChipIcon name={entry.icon} size={10} />
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
        <ChipIcon name="book" size={11} />
        <span>Today's Passage</span>
      </button>
    ) : (
      <>Today's Passage</>
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
        <ChipIcon name="arrow-right-arrow-left" size={10} />
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
        <ChipIcon name="scroll" size={11} />
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
        <ChipIcon name="folder" size={10} />
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
        <ChipIcon name="tag" size={10} />
        <span>{lead.tag.name}</span>
      </button>
    ) : null;

  const layout = homeLeadCopyLayout(lead);
  const subjectChip = threadChip || bookChip || folderChip || tagChip;

  /*
   * A chip and the punctuation after it, kept on one line.
   *
   * The chip is an inline-flex box, and a line may break between a box and the text that
   * follows it — so ", with" could start the next line on its own, which reads as a typo. It
   * only showed once the greeting was centred and balanced, because balancing moves the break.
   */
  const withTrailingPunctuation = (chip: ReactNode, after: ReactNode) => {
    if (!chip || typeof after !== 'string') return <>{chip}{after}</>;
    const match = /^[,.;:!?]+/.exec(after);
    if (!match) return <>{chip}{after}</>;
    return (
      <>
        <span className="proto-home-greeting__glue">
          {chip}
          {match[0]}
        </span>
        {after.slice(match[0].length)}
      </>
    );
  };

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
          {withTrailingPunctuation(countChip, layout.afterChip)}
          {sentenceEnd}
        </>
      );
    }
    return (
      <>
        {layout.beforeChip}
        {withTrailingPunctuation(subjectChip, layout.afterChip)}
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
