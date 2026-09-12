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
 * **Some rows have no control, and say so rather than showing one that does nothing.** Four
 * families are the only family in every draw they belong to, so no preference could change how
 * often they are asked, and a control the engine is entitled to ignore is a lie told in a settings
 * row. Which four is derived from the ladders, not listed here; two of them had switches before
 * that never did anything to how often they came round.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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

/** A run of taps across several rows is one edit, not six. */
const SAVE_DEBOUNCE_MS = 500;

/** Named choices, never a dial — see `review-exercise-settings.ts`. */
const EMPHASIS_OPTIONS: readonly { value: ReviewEmphasis; label: string }[] = [
  { value: 'more', label: 'More' },
  { value: 'normal', label: 'Normal' },
  { value: 'less', label: 'Less' },
];

function EmphasisSegmented({
  family,
  value,
  onChange,
}: {
  family: string;
  value: ReviewEmphasis;
  onChange: (next: ReviewEmphasis) => void;
}) {
  const activeIndex = Math.max(
    0,
    EMPHASIS_OPTIONS.findIndex((option) => option.value === value),
  );
  return (
    <div
      className="proto-appearance-segmented proto-seg-track"
      role="radiogroup"
      aria-label={`How often to ask ${family}`}
      style={
        {
          '--proto-seg-count': EMPHASIS_OPTIONS.length,
          '--proto-seg-index': activeIndex,
          marginTop: 10,
          maxWidth: 260,
        } as CSSProperties
      }
    >
      {EMPHASIS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`proto-appearance-segmented__btn${value === option.value ? ' proto-appearance-segmented__btn--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
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
  /** Sits under the description, so a phone does not squeeze the words to fit three segments. */
  control?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      className="proto-note-row proto-note-row--static"
      style={control ? { alignItems: 'flex-start' } : undefined}
    >
      <span className="proto-settings-list-row__leading" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      {/* A block rather than the usual span: the control below is a block, and a span cannot hold one. */}
      <div className="proto-settings-list-row__main">
        <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>
          {label}
        </span>
        <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
          {sublabel}
        </span>
        {control}
      </div>
      {trailing ? <span className="proto-settings-list-row__trailing">{trailing}</span> : null}
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

  /* Split so the rows with no control sit together at the foot, out of the way of the choices. */
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
                <EmphasisSegmented
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
        {fixed.map((id) => {
          const family = REVIEW_EXERCISE_FAMILIES[id];
          return (
            <ExerciseRow
              key={id}
              icon={family.icon as IconName}
              label={family.label}
              sublabel={family.description}
              /* No control at all, rather than one that is set and cannot move. */
              trailing={<span className="pds-list-preview">Always asked</span>}
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
