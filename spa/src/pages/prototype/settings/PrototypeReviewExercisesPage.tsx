/**
 * Settings → Review exercises.
 *
 * Which kinds of question Review is allowed to ask. Every switch is on by default and stays on
 * for anyone who never opens this page: the stored value is what has been turned *off*, so a new
 * exercise reaches everybody rather than arriving switched off for whoever last saved here.
 *
 * **Some rows have no switch, and say so rather than showing one that does nothing.** Four
 * families are where a step lands when nothing else can be asked — the engine falls forward
 * through a family and ends on its default — so turning one off would leave a step with nothing
 * to resolve to, and the question would appear regardless. A switch the engine is entitled to
 * ignore is a lie told in a settings row, so those rows are marked "Always asked" instead.
 *
 * The page is a preference, not a filter: turning a family off does not remove anything from the
 * queue. The same passages and notes come round; they are asked about differently.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  familyIsAlwaysOn,
  familyIsOn,
  parseReviewExerciseSettings,
  withFamily,
  type ReviewExerciseSettings,
} from '@/utils/review-exercise-settings';
import { api } from '../../../lib/api';
import { profileQueryKey, useProfile } from '../../../hooks/queries/useProfile';
import { SettingsGroup, SettingsIntro, SettingsRow, SettingsShell } from './SettingsShell';

/** A run of taps across several switches is one edit, not six. */
const SAVE_DEBOUNCE_MS = 500;

function ExerciseRow({
  icon,
  label,
  sublabel,
  checked,
  alwaysOn,
  onChange,
}: {
  icon: IconName;
  label: string;
  sublabel: string;
  checked: boolean;
  alwaysOn: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="proto-note-row proto-note-row--static">
      <span className="proto-settings-list-row__leading" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="proto-settings-list-row__main">
        <span className="pds-list-title" style={{ color: 'var(--pds-text-primary)' }}>
          {label}
        </span>
        <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
          {sublabel}
        </span>
      </span>
      <span className="proto-settings-list-row__trailing">
        {alwaysOn ? (
          /* No switch at all, rather than one that is on and cannot move. */
          <span className="pds-list-preview">Always asked</span>
        ) : (
          <span
            className="proto-fte-switch"
            data-on={checked ? 'true' : 'false'}
            role="switch"
            aria-checked={checked}
            aria-label={label}
            tabIndex={0}
            onClick={() => onChange(!checked)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                onChange(!checked);
              }
            }}
          >
            <span className="proto-fte-switch__thumb" />
          </span>
        )}
      </span>
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
          .post('/api/user/review-exercise-settings', { reviewExerciseSettings: { skip: next.skip } })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
          })
          .catch(() => toast.error('Could not save which exercises you want.'));
      }, SAVE_DEBOUNCE_MS);
    },
    [queryClient, userId],
  );

  const toggle = useCallback(
    (id: ReviewExerciseFamilyId, on: boolean) => save(withFamily(settings, id, on)),
    [save, settings],
  );

  /* Split so the rows that cannot move sit together at the foot, out of the way of the choices. */
  const { switchable, fixed } = useMemo(() => {
    const switchableIds: ReviewExerciseFamilyId[] = [];
    const fixedIds: ReviewExerciseFamilyId[] = [];
    for (const id of REVIEW_EXERCISE_FAMILY_ORDER) {
      (familyIsAlwaysOn(id) ? fixedIds : switchableIds).push(id);
    }
    return { switchable: switchableIds, fixed: fixedIds };
  }, []);

  const off = switchable.filter((id) => !familyIsOn(settings, id)).length;

  return (
    <SettingsShell>
      <SettingsIntro>
        Review asks about your passages, chapters and notes in several ways. Turn off the ones you
        would rather not be given.
      </SettingsIntro>

      <SettingsGroup>
        {switchable.map((id) => {
          const family = REVIEW_EXERCISE_FAMILIES[id];
          return (
            <ExerciseRow
              key={id}
              icon={family.icon as IconName}
              label={family.label}
              sublabel={family.description}
              checked={familyIsOn(settings, id)}
              alwaysOn={false}
              onChange={(next) => toggle(id, next)}
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
              checked
              alwaysOn
              onChange={() => undefined}
            />
          );
        })}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          label="Nothing leaves your queue"
          sublabel={
            off > 0
              ? 'The same passages and notes still come round. They are asked about differently.'
              : 'These change how you are asked, never what you are asked about.'
          }
          trailing="none"
        />
      </SettingsGroup>
    </SettingsShell>
  );
}
