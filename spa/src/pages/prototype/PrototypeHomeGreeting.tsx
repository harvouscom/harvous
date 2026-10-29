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
import { useMemo, type ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import Icon, { type IconName } from '@/components/react/Icon';
import { useProfile } from '../../hooks/queries/useProfile';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import {
  greetingForHour,
  homeLeadCopyLayout,
  type HomeLeadTheme,
  type RecallTrendGreetingParts,
} from '@/utils/prototype-home-trends';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import { weekStripLabel, weekStripLine, type WeekStripDay } from '@/utils/home-week-strip';

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
import { HOME_INTRO_LIST_MODES, type SidebarListModeEntry } from './proto-sidebar-list-modes';
import type { SidebarListMode } from '../../layouts/proto-shell-context';

/** The greeting's closing clause — a trend the recall engine surfaced, as a tappable chip. */
export type HomeGreetingTrend = {
  kind: 'arc' | 'subject' | 'passage' | 'crossref' | 'referenceWord';
  parts: RecallTrendGreetingParts;
  /** Called with the tapped label's index — a crossref clause names two passages. */
  onOpen: (labelIndex: number) => boolean | void;
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
  nav,
  onOpenTodaysPassage,
  week,
}: {
  notes: SpaceNoteRow[];
  countForLogic: number;
  hasMoreForLogic: boolean;
  lead: HomeLeadTheme;
  nav: HomeGreetingNav;
  /** The welcome sentence's "Today's Passage" — a chip when the surface can open the reader. */
  onOpenTodaysPassage?: () => void;
  /** The last seven days, for the line and the bars beside the hello (src/utils/home-week-strip). */
  week?: WeekStripDay[];
}) {
  const { user } = useUser();
  const { data: profile } = useProfile();

  const firstName = useMemo(
    () => resolveProfileFirstName(user, profile),
    [user, profile],
  );

  const hello = `${greetingForHour(new Date().getHours())}${firstName ? `, ${firstName}` : ''}.`;
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
          {introListChip('highlights')} and {introListChip('threads')}
        </p>
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

  /*
   * What you're working on, as one short clause after the week: "Advent, four weeks keeps
   * filling up." The copy is the lead's own (homeLeadCopyLayout) with its count clause cut —
   * the week says how much, so the sentence no longer needs to.
   */
  const subjectTail = layout.afterChip.replace(/,?\s*with\s*$/, '').replace(/\s*saved so far\s*$/, '');
  /* A sentence that ends on the chip ends there — no full stop after it. The chip already closes
     the line, and a lone dot hanging off a pill reads as a stray mark, not punctuation. */
  const subjectClause =
    lead.kind === 'none' || !subjectChip ? null : (
      <>
        {layout.beforeChip}
        {subjectTail.trim() ? withTrailingPunctuation(subjectChip, `${subjectTail}.`) : subjectChip}
      </>
    );

  /*
   * Hello and the week, side by side: the words on the left say it, the bars on the right
   * show it. The line counts days in the Word, never the days missed.
   */
  return (
    <div className="proto-home-greeting proto-home-greeting--week">
      <div className="proto-home-greeting__words">
        <p className="proto-home-greeting__hello-line">
          <span className="proto-home-greeting__hello">{hello}</span>
        </p>
        <p className="proto-home-greeting__week-line">
          {week ? weekStripLine(week) : null}
          {week && subjectClause ? ' ' : null}
          {subjectClause}
        </p>
      </div>
      {week ? <HomeWeekStrip days={week} /> : null}
    </div>
  );
}

/** This week's seven bars, Sunday first; today in the accent fill. Unknown days draw nothing yet,
 *  and days still ahead are an empty slot under a faint initial. */
function HomeWeekStrip({ days }: { days: WeekStripDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="proto-home-week" role="img" aria-label={weekStripLabel(days)}>
      {days.map((day) => (
        <div
          key={day.dayKey}
          className="proto-home-week__day"
          data-today={day.isToday ? 'true' : undefined}
          data-future={day.future ? 'true' : undefined}
        >
          <span
            className="proto-home-week__bar"
            data-empty={day.count === 0 ? 'true' : undefined}
            data-unknown={day.known ? undefined : 'true'}
            style={{ height: day.count === 0 ? undefined : `${Math.max(5, Math.round((day.count / max) * 24))}px` }}
          />
          <span className="proto-home-week__initial" aria-hidden>
            {day.initial}
          </span>
        </div>
      ))}
    </div>
  );
}

