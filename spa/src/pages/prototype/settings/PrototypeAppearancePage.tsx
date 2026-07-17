import { useState, useSyncExternalStore } from 'react';
import Icon from '@/components/react/Icon';
import {
  BG_PRESETS,
  IMAGE_PRESETS_LIGHT,
  IMAGE_PRESETS_DARK,
  applyBackgroundWithImageTint,
  canvasDefaultHexForMode,
  getColorSchemeSnapshot,
  imagePresetApplyValue,
  imagePresetById,
  imagePresetUrl,
  isImagePresetSelected,
  presetDisplayLabel,
  readActiveBackground,
  readBackgroundForMode,
  readColorSchemePreference,
  schedulePushAppearanceToAccount,
  subscribeColorScheme,
  writeBackgroundForMode,
  writeColorSchemePreference,
  type BgImagePreset,
  type BgPreset,
  type ColorSchemePreference,
  type ProtoBg,
} from '../../../lib/prototype-background';
import { AppearancePreviewTile } from './AppearancePreviewTile';
import { SettingsGroup, SettingsShell } from './SettingsShell';

type BgKind = 'colors' | 'photos';

export default function PrototypeAppearancePage() {
  const [lightBg, setLightBg] = useState<ProtoBg>(() => readBackgroundForMode('light'));
  const [darkBg, setDarkBg] = useState<ProtoBg>(() => readBackgroundForMode('dark'));
  const [colorSchemePref, setColorSchemePref] = useState<ColorSchemePreference>(() => readColorSchemePreference());
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  const effectiveMode: 'light' | 'dark' =
    colorSchemePref === 'light' ? 'light' : colorSchemePref === 'dark' ? 'dark' : colorScheme;

  const [editingMode, setEditingMode] = useState<'light' | 'dark'>(effectiveMode);
  const [bgKind, setBgKind] = useState<BgKind>(() => {
    const bg = effectiveMode === 'dark' ? readBackgroundForMode('dark') : readBackgroundForMode('light');
    return bg?.kind === 'image-preset' ? 'photos' : 'colors';
  });

  const isAuto = colorSchemePref === 'system';

  const activeBg = editingMode === 'dark' ? darkBg : lightBg;
  const imagePresets = editingMode === 'dark' ? IMAGE_PRESETS_DARK : IMAGE_PRESETS_LIGHT;

  const onPickColorScheme = (pref: ColorSchemePreference) => {
    setColorSchemePref(pref);
    writeColorSchemePreference(pref);
    const newMode = pref === 'light' ? 'light' : pref === 'dark' ? 'dark' : getColorSchemeSnapshot();
    setEditingMode(newMode);
    const bg = readBackgroundForMode(newMode);
    setBgKind(bg?.kind === 'image-preset' ? 'photos' : 'colors');
    void applyBackgroundWithImageTint(readActiveBackground());
    schedulePushAppearanceToAccount();
  };

  const applyForMode = (mode: 'light' | 'dark', next: ProtoBg) => {
    if (mode === 'light') setLightBg(next);
    else setDarkBg(next);
    writeBackgroundForMode(mode, next);
    void applyBackgroundWithImageTint(readActiveBackground());
    schedulePushAppearanceToAccount();
  };

  const onPickColorPreset = (preset: BgPreset) => {
    // Dark has no Paper tile — re-tap the selected color to restore the default canvas.
    if (
      editingMode === 'dark' &&
      isColorPresetSelectedForMode(preset, darkBg, 'dark')
    ) {
      applyForMode('dark', null);
      return;
    }
    const value = editingMode === 'dark'
      ? (preset.dark !== undefined ? preset.dark : preset.light)
      : preset.light;
    const next: ProtoBg = value === null ? null : { kind: 'color', value, presetId: preset.id };
    applyForMode(editingMode, next);
  };

  const onPickImagePreset = (preset: BgImagePreset) => {
    applyForMode(preset.mode, imagePresetApplyValue(preset));
  };

  const onSwitchEditingMode = (mode: 'light' | 'dark') => {
    setEditingMode(mode);
    const bg = readBackgroundForMode(mode);
    setBgKind(bg?.kind === 'image-preset' ? 'photos' : 'colors');
  };

  const onSwitchBgKind = (kind: BgKind) => {
    setBgKind(kind);
  };

  return (
    <SettingsShell appearanceLayout>
      <ActiveHero
        lightBg={lightBg}
        darkBg={darkBg}
        isAuto={isAuto}
        effectiveMode={effectiveMode}
        editingMode={editingMode}
        onTapCard={isAuto ? onSwitchEditingMode : undefined}
      />

      <div className="proto-settings__inset">
        <SettingsGroup>
          {COLOR_SCHEME_OPTIONS.map(({ value, label }, i) => (
            <button
              key={value}
              type="button"
              className="proto-note-row"
              onClick={() => onPickColorScheme(value)}
              style={{
                ...rowStyle,
                ...(i > 0 ? { borderTop: '0.5px solid var(--pds-border)' } : {}),
              }}
            >
              <span className="pds-list-title">{label}</span>
              {colorSchemePref === value ? (
                <span style={{ color: 'var(--pds-accent)', display: 'flex' }} aria-label="Selected">
                  <Icon name="check" size={14} />
                </span>
              ) : null}
            </button>
          ))}
        </SettingsGroup>

        <div style={{ margin: '16px 0 0' }}>
          <SegmentedControl
            options={BG_KIND_OPTIONS}
            value={bgKind}
            onChange={onSwitchBgKind}
          />
        </div>
      </div>

      <BgCarousel
        mode={editingMode}
        bgKind={bgKind}
        activeBg={activeBg}
        imagePresets={imagePresets}
        colorScheme={editingMode}
        onPickColor={onPickColorPreset}
        onPickImage={onPickImagePreset}
      />
    </SettingsShell>
  );
}

// ─── Segmented control ──────────────────────────────────────────────────────

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="proto-appearance-segmented" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          className={`proto-appearance-segmented__btn${value === opt.value ? ' proto-appearance-segmented__btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Active background hero ─────────────────────────────────────────────────

type ActiveHeroProps = {
  lightBg: ProtoBg;
  darkBg: ProtoBg;
  isAuto: boolean;
  effectiveMode: 'light' | 'dark';
  editingMode: 'light' | 'dark';
  onTapCard?: (mode: 'light' | 'dark') => void;
};

function ActiveHero({ lightBg, darkBg, isAuto, effectiveMode, editingMode, onTapCard }: ActiveHeroProps) {
  const cards: { mode: 'light' | 'dark'; bg: ProtoBg }[] = isAuto
    ? [{ mode: 'light', bg: lightBg }, { mode: 'dark', bg: darkBg }]
    : [{ mode: effectiveMode, bg: effectiveMode === 'dark' ? darkBg : lightBg }];

  return (
    <div className={`proto-appearance-hero${cards.length === 1 ? ' proto-appearance-hero--single' : ''}`}>
      {cards.map(({ mode, bg }) => {
        const { name, swatchColor, swatchImageUrl } = describeBg(bg, mode);
        const isEditing = isAuto && editingMode === mode;
        const Tag = onTapCard ? 'button' : 'div';
        return (
          <Tag
            key={mode}
            type={onTapCard ? 'button' : undefined}
            className={`proto-appearance-hero__card${isEditing ? ' proto-appearance-hero__card--editing' : ''}`}
            onClick={onTapCard ? () => onTapCard(mode) : undefined}
          >
            <div
              className={`proto-appearance-hero__canvas proto-appearance-hero__canvas--${mode}`}
              style={{
                backgroundColor: swatchColor,
                ...(swatchImageUrl ? { backgroundImage: `url("${swatchImageUrl}")` } : {}),
              }}
            >
              <div className="proto-appearance-hero__shell">
                <span className="proto-appearance-hero__toolbar" />
                <span className="proto-appearance-hero__body">
                  <span className="proto-appearance-hero__sidebar" />
                  <span className="proto-appearance-hero__main" />
                </span>
              </div>
              {isEditing ? (
                <span className="proto-appearance-hero__check" aria-label="Editing">
                  <Icon name="check" size={12} />
                </span>
              ) : null}
            </div>
            <div className="proto-appearance-hero__label">
              {isAuto ? (
                <span className="proto-appearance-hero__mode">{mode === 'dark' ? 'Dark' : 'Light'}</span>
              ) : null}
              {name ? <span className="proto-appearance-hero__name">{name}</span> : null}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

function describeBg(bg: ProtoBg, mode: 'light' | 'dark'): { name: string; swatchColor: string; swatchImageUrl?: string } {
  if (bg === null) {
    // Paper is light-only branding; dark default canvas has no named color preset.
    if (mode === 'dark') {
      return { name: '', swatchColor: canvasDefaultHexForMode(mode) };
    }
    const preset = BG_PRESETS[0];
    return { name: presetDisplayLabel(preset, mode), swatchColor: canvasDefaultHexForMode(mode) };
  }
  if (bg.kind === 'color') {
    if (bg.presetId) {
      const preset = BG_PRESETS.find((p) => p.id === bg.presetId);
      if (preset) {
        return { name: presetDisplayLabel(preset, mode), swatchColor: bg.value };
      }
    }
    return { name: bg.value, swatchColor: bg.value };
  }
  const preset = imagePresetById(bg.presetId);
  if (preset) {
    return { name: preset.label, swatchColor: 'transparent', swatchImageUrl: imagePresetUrl(preset) };
  }
  return { name: 'Custom', swatchColor: canvasDefaultHexForMode(mode) };
}

// ─── Background carousel ────────────────────────────────────────────────────

type BgCarouselProps = {
  mode: 'light' | 'dark';
  bgKind: BgKind;
  activeBg: ProtoBg;
  imagePresets: BgImagePreset[];
  colorScheme: 'light' | 'dark';
  onPickColor: (preset: BgPreset) => void;
  onPickImage: (preset: BgImagePreset) => void;
};

function BgCarousel({ mode, bgKind, activeBg, imagePresets, colorScheme, onPickColor, onPickImage }: BgCarouselProps) {
  if (bgKind === 'photos') {
    return (
      <div
        className="proto-appearance-carousel"
        role="listbox"
        aria-label={`${mode} photo background`}
        style={{ marginTop: 12 }}
      >
        {imagePresets.map((preset) => (
          <AppearancePreviewTile
            key={preset.id}
            label={preset.label}
            selected={isImagePresetSelected(preset, activeBg)}
            canvasImageUrl={imagePresetUrl(preset)}
            glassMode="image"
            onClick={() => onPickImage(preset)}
          />
        ))}
      </div>
    );
  }

  // Paper is the light default only — dark Colors shows named dark pairs (Night, Dusk, …).
  const colorPresets =
    mode === 'dark' ? BG_PRESETS.filter((preset) => !isPaperColorPreset(preset)) : BG_PRESETS;

  return (
    <div
      className="proto-appearance-carousel proto-appearance-carousel--colors"
      role="listbox"
      aria-label={`${mode} color background`}
      style={{ marginTop: 12 }}
    >
      {colorPresets.map((preset) => (
        <AppearancePreviewTile
          key={preset.label}
          label={presetDisplayLabel(preset, colorScheme)}
          selected={isColorPresetSelectedForMode(preset, activeBg, mode)}
          canvasColor={modeSwatchColor(preset, mode)}
          onClick={() => onPickColor(preset)}
        />
      ))}
    </div>
  );
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLOR_SCHEME_OPTIONS: { value: ColorSchemePreference; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const BG_KIND_OPTIONS: { value: BgKind; label: string }[] = [
  { value: 'colors', label: 'Colors' },
  { value: 'photos', label: 'Imagery' },
];

const rowStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px',
  border: 'none',
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  color: 'var(--pds-text-primary)',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPaperColorPreset(preset: BgPreset): boolean {
  return preset.light === null && (preset.dark === null || preset.dark === undefined);
}

function modeSwatchColor(preset: BgPreset, mode: 'light' | 'dark'): string {
  if (mode === 'dark' && preset.dark !== undefined) {
    return preset.dark === null ? canvasDefaultHexForMode('dark') : preset.dark;
  }
  return preset.light === null ? canvasDefaultHexForMode('light') : preset.light;
}

function isColorPresetSelectedForMode(preset: BgPreset, bg: ProtoBg, _mode: 'light' | 'dark'): boolean {
  if (isPaperColorPreset(preset)) return bg === null;
  if (bg?.kind !== 'color') return false;
  if (bg.presetId) return bg.presetId === preset.id;
  return false;
}
