/**
 * The picture that goes with whatever the reader chose for their canvas.
 *
 * Chrome elsewhere in the app already pairs colour with imagery: a space cover
 * picked as "sky" shows the sky photograph, because the appearance catalogue is
 * ordered so every colour has an image beside it, per mode
 * (`APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID` and its dark twin). This applies the
 * same pairing to a surface that has no cover of its own, so a sheet's header
 * looks like it belongs to the reader's app rather than to the app in general.
 *
 * Three answers, in order:
 *
 *   - **They chose an image.** Use that exact image. It is their wallpaper; the
 *     header is a sliver of the same thing, and it is already in cache.
 *   - **They chose a colour.** Use the image the catalogue pairs with it.
 *   - **They chose Paper, or have chosen nothing.** Use the first image of the
 *     mode. Paper is a preference about the canvas they write on, not an
 *     instruction to strip decoration from every sheet — and a header that is
 *     blank for most people is not the feature this was asked to be.
 */
import {
  IMAGE_PRESETS_DARK,
  IMAGE_PRESETS_LIGHT,
  imagePresetById,
  imagePresetUrl,
  readBackgroundForMode,
} from './prototype-background';
import {
  APPEARANCE_COLOR_TO_DARK_IMAGE_ID,
  APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID,
  appearanceAccentHexFromCoverBg,
} from '@/utils/space-cover';

export type AppearanceCompanionImage = {
  presetId: string;
  url: string;
  /**
   * The paired colour, for painting the strip while the file decodes.
   *
   * Worth carrying because the picture is only pre-cached in one of the three
   * cases — when it *is* their wallpaper. For the other two a bare strip would
   * sit empty for a beat, which reads as a bug rather than as loading.
   */
  tint: string | null;
};

/** Neutral fallback: first in the catalogue for the mode (breeze / cinder). */
function defaultPresetIdForMode(mode: 'light' | 'dark'): string | null {
  const catalogue = mode === 'dark' ? IMAGE_PRESETS_DARK : IMAGE_PRESETS_LIGHT;
  return catalogue[0]?.id ?? null;
}

/** The appearance-paired image preset id for this mode, before it is resolved to a file. */
export function appearanceCompanionPresetId(mode: 'light' | 'dark'): string | null {
  const chosen = readBackgroundForMode(mode);

  if (chosen?.kind === 'image-preset') return chosen.presetId;

  if (chosen?.kind === 'color' && chosen.presetId) {
    const paired =
      mode === 'dark'
        ? APPEARANCE_COLOR_TO_DARK_IMAGE_ID[chosen.presetId]
        : APPEARANCE_COLOR_TO_LIGHT_IMAGE_ID[chosen.presetId];
    if (paired) return paired;
  }

  return defaultPresetIdForMode(mode);
}

/**
 * `{ presetId, url, tint }` for the image to show.
 *
 * Null only if the catalogue itself is empty. A *stored* preset that has since
 * been retired never reaches here as one: `parseProtoBg` drops an image preset
 * it cannot find, so that reader is treated as having chosen nothing and gets
 * the neutral image, which is the outcome you would want anyway.
 */
export function appearanceCompanionImage(mode: 'light' | 'dark'): AppearanceCompanionImage | null {
  const presetId = appearanceCompanionPresetId(mode);
  if (!presetId) return null;
  const preset = imagePresetById(presetId);
  if (!preset) return null;
  return {
    presetId,
    url: imagePresetUrl(preset),
    /* Every image in the catalogue has a colour beside it, so this asks the
       same map the space covers ask — through the image, not the reader's
       choice, so the strip's holding colour matches the picture that lands. */
    tint: appearanceAccentHexFromCoverBg({ kind: 'image-preset', presetId }, mode),
  };
}
