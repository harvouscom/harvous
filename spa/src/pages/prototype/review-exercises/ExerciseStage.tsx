/**
 * The Review card's stage: one question laid out as a card from a deck, not a paragraph.
 *
 * Every rung was the same three things stacked at 15px — an instruction, a quoted block, a row of
 * compact chips — inside a box that scrolled at 360px. It read as a form about the verse rather
 * than the verse itself. The stage gives each question the same three places and lets the middle
 * one take the room:
 *
 * - **the ask**, the instruction the rung already writes (`item.prompt`), at the top;
 * - **the scene**, the thing being asked about, as the card's centrepiece — the verse, the line
 *   from a note, the verse with its gaps in it;
 * - **the work**, the pieces the reader handles — options, tiles, a writing area.
 *
 * And a footer band that owns the bottom edge, for what the card has to say after a miss and for
 * the one action an answer that is *built* rather than tapped needs. A tap-to-answer rung has no
 * button: the tap is the answer, and a Check after it would be a second question.
 *
 * Layout only. What is asked, how it is marked and every piece of state stay in the dock, which a
 * source test pins (`review-dock-held-item.test.ts`).
 */
import type { ReactNode } from 'react';

export interface ExerciseStageAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ExerciseStageProps {
  /** The instruction. It names its own subject, and hides it on the rungs where it is the answer. */
  task: ReactNode;
  /** What this is to the reader, or which note — the line the instruction leaves out. */
  subject?: ReactNode;
  /** The thing being asked about. Absent on the rungs that deliberately keep it off screen. */
  scene?: ReactNode;
  /** A modifier for the scene panel, e.g. `altered` for the one rung that must not look like Scripture. */
  sceneTone?: 'altered';
  /** The pieces the reader handles. */
  children?: ReactNode;
  /** What the card says about the last go: the hint and the retry line. */
  say?: ReactNode;
  /** Set after a miss, so the band carries it as well as the words. */
  missed?: boolean;
  /** The one action, for answers that are built before they are sent. */
  primary?: ExerciseStageAction | null;
  /** Anything else the footer holds — the self-rated verdicts, a retry for a failed load. */
  actions?: ReactNode;
}

export function ExerciseStage({
  task,
  subject,
  scene,
  sceneTone,
  children,
  say,
  missed = false,
  primary,
  actions,
}: ExerciseStageProps) {
  const hasFoot = Boolean(say || primary || actions);
  return (
    <div className="rx-stage">
      <div className="rx-main" data-bare={scene ? undefined : ''}>
        <div className="rx-ask">
          <p className="rx-task">{task}</p>
          {subject ? <p className="rx-subject">{subject}</p> : null}
        </div>
        {scene ? (
          <div className="rx-scene" data-tone={sceneTone}>
            {scene}
          </div>
        ) : null}
        {children ? <div className="rx-work">{children}</div> : null}
      </div>
      {hasFoot ? (
        <div className="rx-foot" data-missed={missed ? '' : undefined}>
          <div className="rx-foot__say">{say}</div>
          {actions || primary ? (
            <div className="rx-foot__actions">
              {actions}
              {primary ? (
                <button
                  type="button"
                  className="proto-settings-btn proto-settings-btn--compact rx-primary"
                  disabled={primary.disabled}
                  onClick={primary.onClick}
                >
                  {primary.label}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * How big the scene's words can be, by how many of them there are.
 *
 * A verse is anything from six words to eighty. One size that suits "Jesus wept" leaves a long
 * verse spilling past the card; one that suits the long verse makes the short one look lost. The
 * breakpoints are characters because that is what fills a line.
 */
export function heroSize(text: string | null | undefined): 'lg' | 'md' | 'sm' {
  const length = (text ?? '').replace(/<[^>]*>/g, '').trim().length;
  if (length > 320) return 'sm';
  if (length > 170) return 'md';
  return 'lg';
}
