import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Icon from '@/components/react/Icon';
import {
  BG_PRESETS,
  MAX_IMAGE_BYTES,
  applyBackgroundWithImageTint,
  getColorSchemeSnapshot,
  isPhotoAvailable,
  isPhotoSelected,
  isPresetSelected,
  presetApplyValue,
  presetDisplayLabel,
  presetSwatchColor,
  readBackground,
  readSavedImage,
  removeSavedImage,
  saveUploadedImage,
  selectSavedImage,
  setActiveBackground,
  subscribeColorScheme,
  type BgPreset,
  type ProtoBg,
  type ProtoSavedImage,
} from '../../../lib/prototype-background';
import { AppearancePreviewTile } from './AppearancePreviewTile';
import { SettingsShell, SettingsGroup } from './SettingsShell';

export default function PrototypeAppearancePage() {
  const [active, setActive] = useState<ProtoBg>(() => readBackground());
  const [savedImage, setSavedImage] = useState<ProtoSavedImage | null>(() => readSavedImage());
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light');

  useEffect(() => {
    if (active?.kind !== 'image') return;
    void applyBackgroundWithImageTint(active);
  }, [colorScheme, active]);

  const applyActive = (next: ProtoBg) => {
    setError(null);
    setActive(next);
    setActiveBackground(next);
    void applyBackgroundWithImageTint(next);
  };

  const onPickPreset = (preset: (typeof BG_PRESETS)[number]) => {
    applyActive(presetApplyValue(preset));
  };

  const onPickPhoto = () => {
    if (!isPhotoAvailable(savedImage)) {
      fileInputRef.current?.click();
      return;
    }
    const next = selectSavedImage();
    if (!next) return;
    setError(null);
    setActive(next);
    void applyBackgroundWithImageTint(next);
  };

  const onRemoveImage = () => {
    setError(null);
    const next = removeSavedImage();
    setSavedImage(null);
    setActive(next);
    void applyBackgroundWithImageTint(next);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image is too large. Please pick one under 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === 'string' ? reader.result : null;
      if (!result) return;
      try {
        const optimized = await optimizeWallpaperDataUrl(result);
        setError(null);
        const next = saveUploadedImage(optimized);
        setSavedImage({ value: optimized });
        setActive(next);
        void applyBackgroundWithImageTint(next);
      } catch {
        setError("Couldn't process that image. Please try another.");
      }
    };
    reader.onerror = () => setError("Couldn't read that image. Please try another.");
    reader.readAsDataURL(file);
  };

  const hasSavedImage = isPhotoAvailable(savedImage);
  const carouselRef = useRef<HTMLDivElement>(null);

  const carouselOptions = useMemo(() => orderAppearanceOptions(active), [active]);

  useEffect(() => {
    carouselRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [active]);

  return (
    <SettingsShell title="Appearance" appearanceLayout>
      <div className="proto-settings__inset">
        <p className="pds-subheadline" style={{ color: 'var(--pds-text-secondary)', margin: '0 0 16px' }}>
          Choose a canvas color or photo—the shell glass tints to match. Saved on this device.
        </p>
      </div>

      <div ref={carouselRef} className="proto-appearance-carousel" role="listbox" aria-label="Background">
        {carouselOptions.map((option) => {
          if (option.kind === 'preset') {
            const preset = option.preset;
            return (
              <AppearancePreviewTile
                key={preset.label}
                label={presetDisplayLabel(preset, colorScheme)}
                selected={isPresetSelected(preset, active)}
                canvasColor={presetSwatchColor(preset)}
                onClick={() => onPickPreset(preset)}
              />
            );
          }
          return (
            <AppearancePreviewTile
              key="photo"
              label="Photo"
              selected={isPhotoSelected(active)}
              canvasColor={hasSavedImage ? undefined : 'var(--pds-bg-control)'}
              canvasImageUrl={hasSavedImage ? savedImage!.value : undefined}
              photoEmpty={!hasSavedImage}
              glassMode="image"
              onClick={onPickPhoto}
            />
          );
        })}
      </div>

      <div className="proto-settings__inset">
      {hasSavedImage ? (
        <SettingsGroup>
          <button
            type="button"
            className="proto-note-row"
            onClick={() => fileInputRef.current?.click()}
            style={rowStyle}
          >
            <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 6,
                  flexShrink: 0,
                  backgroundImage: `url("${savedImage!.value}")`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  border: '0.5px solid var(--pds-border)',
                }}
              />
              <span className="pds-list-title">Replace image</span>
            </span>
            <span style={{ display: 'flex', color: 'var(--pds-text-tertiary)' }} aria-hidden>
              <Icon name="chevron-right" size={12} />
            </span>
          </button>
          <button
            type="button"
            className="proto-note-row"
            onClick={onRemoveImage}
            style={{ ...rowStyle, color: 'var(--pds-destructive)' }}
          >
            <span className="pds-list-title" style={{ color: 'var(--pds-destructive)' }}>Remove image</span>
          </button>
        </SettingsGroup>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onPickFile}
        style={{ display: 'none' }}
      />

      {error ? (
        <p style={{ color: 'var(--pds-destructive)', fontSize: '0.8125rem', padding: '8px 0 0' }}>{error}</p>
      ) : null}
      </div>
    </SettingsShell>
  );
}

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

async function optimizeWallpaperDataUrl(source: string): Promise<string> {
  const img = await loadImage(source);
  const MAX_EDGE = 1600;
  const largest = Math.max(img.width, img.height);
  const scale = largest > MAX_EDGE ? MAX_EDGE / largest : 1;
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', 0.82) || canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image-load-failed'));
    img.src = src;
  });
}

type AppearanceOption = { kind: 'preset'; preset: BgPreset } | { kind: 'photo' };

function orderAppearanceOptions(active: ProtoBg): AppearanceOption[] {
  const options: AppearanceOption[] = [
    ...BG_PRESETS.map((preset) => ({ kind: 'preset' as const, preset })),
    { kind: 'photo' as const },
  ];
  const activeIndex = options.findIndex((option) =>
    option.kind === 'photo' ? isPhotoSelected(active) : isPresetSelected(option.preset, active),
  );
  if (activeIndex <= 0) return options;
  return [options[activeIndex], ...options.slice(0, activeIndex), ...options.slice(activeIndex + 1)];
}
