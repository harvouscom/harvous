import { useEffect, useState, useSyncExternalStore } from 'react';
import Icon from '@/components/react/Icon';
import { type ThreadColor } from '@/utils/colors';
import {
  SPACE_COVER_PICKER_COLORS,
  spaceCoverFromThreadColor,
  spacePickerSwatchColor,
  type SpaceCoverBg,
} from '@/utils/space-cover';
import {
  clampSpaceCoverVariant,
  listSpaceCoverVariantsForFamily,
  resolveSpaceCoverVariant,
  spaceCoverPresetUrl,
} from '@/utils/space-cover-presets';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { resolveJoinHeroBackground, resolveJoinHeroImageUrl } from '../../lib/space-cover-display';
import { useUpdateSharedSpace } from '../../hooks/mutations/useUpdateSharedSpace';
import {
  parseStudyPlanningMode,
  STUDY_PLANNING_MODE_LABELS,
  STUDY_PLANNING_MODES,
  type StudyPlanningMode,
} from '@/utils/space-study-planning';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import type { IconName } from '@/components/react/Icon';
import {
  PUBLISH_CADENCE_VALUES,
  cadenceLabel,
  parsePublishCadence,
  staffCadenceStaleHint,
  type PublishCadence,
} from '@/utils/channel-publish-cadence';

type CoverPickerMode = 'none' | 'color' | 'image';

const CADENCE_OPTIONS: Array<{ value: '' | PublishCadence; label: string }> = [
  { value: '', label: 'Not set' },
  ...PUBLISH_CADENCE_VALUES.map((value) => ({
    value,
    label: cadenceLabel(value) ?? value,
  })),
];

function baselineVariantFor(
  color: string | null | undefined,
  coverBgLight: SpaceCoverBg | null | undefined,
  explicit?: number | null,
): number {
  if (explicit != null) return clampSpaceCoverVariant(explicit);
  return resolveSpaceCoverVariant(coverBgLight, (color || 'blue').toLowerCase());
}

export default function PrototypeSpaceSettingsSection({
  spaceId,
  initialTitle,
  initialColor,
  initialDescription,
  initialCoverBgLight,
  initialCoverVariant,
  initialPublishCadence,
  initialCadenceStale = false,
  initialStudyPlanningMode = 'off',
  onSaved,
  /** Shared Spaces: people. Ministry channels: rss. */
  iconName = 'user-group',
  ministryChannel = false,
}: {
  spaceId: string;
  initialTitle: string;
  initialColor?: string | null;
  initialDescription?: string | null;
  /** Stored light cover — used to restore the active variant when reopening settings. */
  initialCoverBgLight?: SpaceCoverBg | null;
  /** Optional explicit 1–5; wins over parsing `initialCoverBgLight`. */
  initialCoverVariant?: number | null;
  initialPublishCadence?: PublishCadence | string | null;
  /** Observed lag vs declared cadence — staff-only soft hint. */
  initialCadenceStale?: boolean;
  /** Shared rooms: whether members may say what the room studies next. */
  initialStudyPlanningMode?: StudyPlanningMode | string | null;
  onSaved?: (title: string) => void;
  iconName?: IconName;
  ministryChannel?: boolean;
}) {
  const descriptionPlaceholder = ministryChannel
    ? 'Optional description of this channel'
    : 'Optional description of this space';
  const defaultColor = ((initialColor as ThreadColor) || 'blue') as ThreadColor;
  const [title, setTitle] = useState(initialTitle);
  const [color, setColor] = useState<ThreadColor>(defaultColor);
  const [coverVariant, setCoverVariant] = useState(() =>
    baselineVariantFor(defaultColor, initialCoverBgLight, initialCoverVariant),
  );
  const [baselineVariant, setBaselineVariant] = useState(() =>
    baselineVariantFor(defaultColor, initialCoverBgLight, initialCoverVariant),
  );
  const [pickerMode, setPickerMode] = useState<CoverPickerMode>('none');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [publishCadence, setPublishCadence] = useState<PublishCadence | ''>(
    () => parsePublishCadence(initialPublishCadence) ?? '',
  );
  const [studyPlanningMode, setStudyPlanningMode] = useState<StudyPlanningMode>(() =>
    parseStudyPlanningMode(initialStudyPlanningMode),
  );
  const updateSpace = useUpdateSharedSpace();
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  const initialCoverPresetId =
    initialCoverBgLight && typeof initialCoverBgLight === 'object' && 'presetId' in initialCoverBgLight
      ? String(initialCoverBgLight.presetId)
      : typeof initialCoverBgLight === 'string'
        ? initialCoverBgLight
        : '';

  // Sync color/cover when the space identity or saved cover changes — not when the
  // parent only echoes the title after save (that was snapping the image back).
  useEffect(() => {
    const nextColor = ((initialColor as ThreadColor) || 'blue') as ThreadColor;
    const nextVariant = baselineVariantFor(nextColor, initialCoverBgLight, initialCoverVariant);
    setColor(nextColor);
    setCoverVariant(nextVariant);
    setBaselineVariant(nextVariant);
    setPickerMode('none');
  }, [spaceId, initialColor, initialCoverPresetId, initialCoverVariant]);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    setDescription(initialDescription ?? '');
  }, [initialDescription]);

  useEffect(() => {
    setPublishCadence(parsePublishCadence(initialPublishCadence) ?? '');
  }, [initialPublishCadence, spaceId]);

  useEffect(() => {
    setStudyPlanningMode(parseStudyPlanningMode(initialStudyPlanningMode));
  }, [initialStudyPlanningMode, spaceId]);

  const normalizedDescription = description.trim();
  const initialDescriptionNorm = (initialDescription ?? '').trim();
  const initialCadenceNorm = parsePublishCadence(initialPublishCadence) ?? '';
  const initialStudyPlanningNorm = parseStudyPlanningMode(initialStudyPlanningMode);
  const dirty =
    title.trim() !== initialTitle.trim() ||
    color !== (initialColor || 'blue') ||
    coverVariant !== baselineVariant ||
    normalizedDescription !== initialDescriptionNorm ||
    (ministryChannel && publishCadence !== initialCadenceNorm) ||
    (!ministryChannel && studyPlanningMode !== initialStudyPlanningNorm);
  const staleHint =
    ministryChannel && initialCadenceStale && publishCadence === initialCadenceNorm
      ? staffCadenceStaleHint(publishCadence || null)
      : null;

  const cover = spaceCoverFromThreadColor(color, coverVariant);
  const coverPreview = {
    color,
    cover: { light: cover.light, dark: cover.dark },
  };
  const heroStyle = resolveJoinHeroBackground(coverPreview, colorScheme);
  const heroIsImage = Boolean(resolveJoinHeroImageUrl(coverPreview, colorScheme));
  const variantThumbs = listSpaceCoverVariantsForFamily(color, colorScheme);

  function toggleMode(mode: Exclude<CoverPickerMode, 'none'>) {
    setPickerMode((prev) => (prev === mode ? 'none' : mode));
  }

  function selectColor(next: ThreadColor) {
    if (next !== color) {
      setColor(next);
      setCoverVariant(1);
    }
  }

  function save() {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    updateSpace.mutate(
      {
        spaceId,
        title: trimmed,
        color,
        coverVariant,
        description: normalizedDescription || null,
        /* No meeting fields here — they live on their own page now, and an
           omitted field means "leave it alone" to the update route, so saving
           the room's name cannot disturb its rhythm. */
        ...(ministryChannel ? { publishCadence: publishCadence || null } : {}),
        /* Sent only when it changed: the route refuses it on a channel, and an
           unchanged value has nothing to say. */
        ...(!ministryChannel && studyPlanningMode !== initialStudyPlanningNorm
          ? { studyPlanningMode }
          : {}),
      },
      {
        onSuccess: () => {
          setBaselineVariant(coverVariant);
          toast.success('Saved');
          onSaved?.(trimmed);
        },
        onError: (err) => {
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update';
          toast.error(msg);
        },
      },
    );
  }

  return (
    <div className="proto-shared-space-settings">
      <div className="proto-shared-space-settings__field">
        <label htmlFor="proto-space-settings-title">Name</label>
        <input
          id="proto-space-settings-title"
          type="text"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="proto-shared-space-settings__field">
        <label htmlFor="proto-space-settings-description">Description</label>
        <textarea
          id="proto-space-settings-description"
          value={description}
          maxLength={500}
          rows={2}
          placeholder={descriptionPlaceholder}
          onChange={(e) => setDescription(e.target.value)}
          style={{ resize: 'vertical', minHeight: 52 }}
        />
      </div>
      {ministryChannel ? (
        <div className="proto-shared-space-settings__field">
          <label htmlFor="proto-space-settings-cadence">How often does this channel update?</label>
          <select
            id="proto-space-settings-cadence"
            value={publishCadence}
            onChange={(e) =>
              setPublishCadence((e.target.value as PublishCadence | '') || '')
            }
          >
            {CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value || 'not-set'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {staleHint ? (
            <p className="proto-caption proto-shared-space-settings__cadence-hint">{staleHint}</p>
          ) : null}
        </div>
      ) : (
        <div className="proto-shared-space-settings__field">
          <label htmlFor="proto-space-settings-study-planning">What we study next</label>
          <select
            id="proto-space-settings-study-planning"
            value={studyPlanningMode}
            onChange={(e) => setStudyPlanningMode(parseStudyPlanningMode(e.target.value))}
          >
            {STUDY_PLANNING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {STUDY_PLANNING_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          {/* Said here, before anyone turns it on: the suggestion is attributed. */}
          <p className="proto-caption proto-shared-space-settings__cadence-hint">
            {studyPlanningMode === 'suggest'
              ? 'Suggestions go to whoever runs the room, with the member’s name on them. You choose what becomes the next study.'
              : 'Let members propose a passage, a note, or an idea for what the room studies next.'}
          </p>
        </div>
      )}
      <div className="proto-shared-space-settings__field">
        <label>Color &amp; background</label>
        <div
          className={`proto-space-cover-picker proto-space-cover-picker--preview-led${pickerMode !== 'none' ? ` proto-space-cover-picker--mode-${pickerMode}` : ''}`}
        >
          <div className="proto-space-cover-picker__preview">
            <button
              type="button"
              className={`proto-space-cover-picker__hero-hit${heroIsImage ? ' proto-space-cover-picker__hero--image' : ''}${pickerMode === 'image' ? ' proto-space-cover-picker__hero-hit--active' : ''}`}
              style={heroStyle}
              aria-pressed={pickerMode === 'image'}
              aria-label="Choose cover image"
              title="Choose cover image"
              onClick={() => toggleMode('image')}
            />
            <button
              type="button"
              className={`proto-space-cover-picker__tile-hit${pickerMode === 'color' ? ' proto-space-cover-picker__tile-hit--active' : ''}`}
              aria-pressed={pickerMode === 'color'}
              aria-label="Choose color"
              title="Choose color"
              onClick={(e) => {
                e.stopPropagation();
                toggleMode('color');
              }}
            >
              <ProtoSpaceMenuIcon color={color} size={28} radius={8} iconName={iconName} />
            </button>
          </div>

          {pickerMode === 'color' ? (
            <div className="proto-space-cover-picker__tray" role="radiogroup" aria-label="Color">
              {SPACE_COVER_PICKER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  className={`proto-shared-space-settings__color proto-space-cover-picker__tray-swatch${color === c ? ' proto-shared-space-settings__color--selected' : ''}`}
                  style={{ ['--swatch-accent' as string]: spacePickerSwatchColor(c) }}
                  title={c}
                  onClick={() => selectColor(c)}
                >
                  {color === c ? <Icon name="check" size={12} /> : null}
                </button>
              ))}
            </div>
          ) : null}

          {pickerMode === 'image' && variantThumbs.length > 0 ? (
            <div className="proto-space-cover-picker__tray" role="radiogroup" aria-label="Cover image">
              {variantThumbs.map((preset) => {
                const selected = coverVariant === preset.variant;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={preset.label}
                    title={preset.label}
                    className={`proto-space-cover-picker__thumb${selected ? ' proto-space-cover-picker__thumb--selected' : ''}`}
                    style={{ backgroundImage: `url(${spaceCoverPresetUrl(preset)})` }}
                    onClick={() => setCoverVariant(preset.variant)}
                  >
                    {selected ? (
                      <span className="proto-space-cover-picker__thumb-check" aria-hidden>
                        <Icon name="check" size={12} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="proto-settings-btn"
        disabled={!dirty || updateSpace.isPending}
        onClick={save}
        style={{ marginTop: 10 }}
      >
        {updateSpace.isPending ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
