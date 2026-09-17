/**
 * Settings → Review exercises.
 *
 * How much of each kind of question a reader would like. Every family starts Normal and stays
 * Normal for anyone who never opens this page: only a choice away from Normal is stored, so a new
 * exercise reaches everybody at its ordinary rate.
 *
 * **A choice of three, not a switch.** Less is what "off" used to be — the engine walks past the
 * family wherever its step has something else to ask — and More counts it twice in the draw.
 * Neither removes anything from the queue, and neither can make a question impossible. Why More is
 * a weight rather than an order is in `review-exercise-settings.ts`.
 *
 * **Some families have no control, and the page leads with them.** Four are the only family in
 * every draw they belong to, so no preference could change how often they are asked, and a
 * control the engine is entitled to ignore is a lie told in a settings row. Which four is derived
 * from the ladders, not listed here; two of them had switches before that never did anything to
 * how often they came round.
 *
 * They were four rows at the foot, each wearing "Always asked" — the same non-answer four times,
 * below every control, reading as the leftovers. One row at the top instead: what is always true
 * about Review is the context the choices underneath are choices against.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import Icon, { type IconName } from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import {
  REVIEW_EXERCISE_FAMILIES,
  REVIEW_EXERCISE_FAMILY_ORDER,
  type ReviewExerciseFamilyId,
} from '@/utils/review-exercise-families';
import {
  DEFAULT_REVIEW_EXERCISE_SETTINGS,
  emphasisFor,
  familyIsAlwaysOn,
  parseReviewExerciseSettings,
  withEmphasis,
  type ReviewEmphasis,
  type ReviewExerciseSettings,
} from '@/utils/review-exercise-settings';
import { api } from '../../../lib/api';
import { profileQueryKey, useProfile } from '../../../hooks/queries/useProfile';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';
import ProtoSelectMenu from '../ProtoSelectMenu';

/** A run of taps across several rows is one edit, not six. */
const SAVE_DEBOUNCE_MS = 500;

/** Named choices, never a dial — see `review-exercise-settings.ts`. */
const EMPHASIS_OPTIONS: readonly { value: ReviewEmphasis; label: string }[] = [
  { value: 'more', label: 'More' },
  { value: 'normal', label: 'Normal' },
  { value: 'less', label: 'Less' },
];

/**
 * The choice, on the row rather than under it.
 *
 * It was a full-width three-segment bar beneath every description, which made each of twelve
 * families about seventy pixels tall and the page a long scroll of identical controls — you
 * could see three rows at a time on a phone, so comparing "how often do I want Blanks against
 * First letters" meant remembering the answer while you scrolled to it.
 *
 * The house picker instead (`ProtoSelectMenu`), which is what this app uses everywhere someone
 * chooses one of a list. One tap instead of none to see the options, and in exchange the rows
 * are half the height and the whole set is on one screen — worth it for a page you visit once,
 * set, and leave.
 */
function EmphasisChoice({
  family,
  value,
  onChange,
}: {
  family: string;
  value: ReviewEmphasis;
  onChange: (next: ReviewEmphasis) => void;
}) {
  return (
    <ProtoSelectMenu
      label={`How often to ask ${family}`}
      value={value}
      options={EMPHASIS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      onChange={onChange}
      menuWidth={160}
      /* Narrow, and it reads at full strength only when it is not Normal: the page is a list of
         defaults with a few deliberate exceptions, and the exceptions should be the thing you
         can find again. */
      className={`proto-exercise-choice${value === 'normal' ? '' : ' proto-exercise-choice--set'}`}
    />
  );
}

function ExerciseRow({
  icon,
  label,
  sublabel,
  control,
  trailing,
}: {
  icon: IconName;
  label: string;
  sublabel: string;
  /** Sits on the row's right-hand edge, on the same line as the name. */
  control?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="proto-note-row proto-note-row--static proto-exercise-row">
      <span className="proto-settings-list-row__leading proto-settings-list-row__leading--compact" aria-hidden>
        <Icon name={icon} size={13} />
      </span>
      <div className="proto-settings-list-row__main">
        <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>
          {label}
        </span>
        {/* One muted line, clipped rather than wrapped — the full sentence is on `title`, and a
            description that wraps to three lines undoes the height the control just saved. */}
        <span className="pds-list-preview proto-exercise-row__desc" title={sublabel}>
          {sublabel}
        </span>
      </div>
      {control || trailing ? (
        <span className="proto-settings-list-row__trailing">{control ?? trailing}</span>
      ) : null}
    </div>
  );
}

export default function PrototypeReviewExercisesPage() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const [settings, setSettings] = useState<ReviewExerciseSettings>(
    DEFAULT_REVIEW_EXERCISE_SETTINGS,
  );
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    setSettings(parseReviewExerciseSettings(profile?.reviewExerciseSettings ?? null));
  }, [profile?.reviewExerciseSettings]);

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

  /** Optimistic locally, debounced to the account — the same shape the reminders page uses. */
  const save = useCallback(
    (next: ReviewExerciseSettings) => {
      setSettings(next);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void api
          .post('/api/user/review-exercise-settings', {
            reviewExerciseSettings: { emphasis: next.emphasis },
          })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
          })
          .catch(() => toast.error('Could not save your exercise preferences.'));
      }, SAVE_DEBOUNCE_MS);
    },
    [queryClient, userId],
  );

  const choose = useCallback(
    (id: ReviewExerciseFamilyId, next: ReviewEmphasis) => save(withEmphasis(settings, id, next)),
    [save, settings],
  );

  /* Split so what is always asked can lead, and the choices follow it. */
  const { offered, fixed } = useMemo(() => {
    const offeredIds: ReviewExerciseFamilyId[] = [];
    const fixedIds: ReviewExerciseFamilyId[] = [];
    for (const id of REVIEW_EXERCISE_FAMILY_ORDER) {
      (familyIsAlwaysOn(id) ? fixedIds : offeredIds).push(id);
    }
    return { offered: offeredIds, fixed: fixedIds };
  }, []);

  const leaning = offered.some((id) => emphasisFor(settings, id) !== 'normal');

  return (
    <SettingsShell>
      <SettingsIntro>
        Review asks about your passages, chapters and notes in several ways. Lean toward the ones
        that suit you.
      </SettingsIntro>

      {/*
        * What is always asked, first and in one row.
        *
        * These four sat at the foot as four full rows wearing "Always asked" — four repetitions
        * of the same non-answer, below every control, where they read as the leftovers. They are
        * not: they are the part of Review that is always true, and saying so once at the top is
        * the context the choices below are choices *against*. It also gives back three rows.
        *
        * Named from the derivation rather than a list, so a family that stops sharing a draw
        * appears here without anyone remembering to add it.
        */}
      <SettingsGroup>
        <SettingsRow
          label="Always asked"
          sublabel={fixed.map((id) => REVIEW_EXERCISE_FAMILIES[id].label).join(' · ')}
          trailing="none"
        />
      </SettingsGroup>

      <SettingsGroup>
        {offered.map((id) => {
          const family = REVIEW_EXERCISE_FAMILIES[id];
          return (
            <ExerciseRow
              key={id}
              icon={family.icon as IconName}
              label={family.label}
              sublabel={family.description}
              control={
                <EmphasisChoice
                  family={family.label}
                  value={emphasisFor(settings, id)}
                  onChange={(next) => choose(id, next)}
                />
              }
            />
          );
        })}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Nothing leaves your queue"
          sublabel={
            leaning
              ? 'The same passages and notes come round. Review leans toward what you asked for where the question has somewhere else to go.'
              : 'These change how you are asked, never what you are asked about.'
          }
          trailing="none"
        />
      </SettingsGroup>
    </SettingsShell>
  );
}
