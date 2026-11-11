import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import Icon from '@/components/react/Icon';
import { DEFAULT_SOUND_PREFERENCE, type SoundPreference } from '@/utils/sound-prefs';
import { playSound, warmSounds, type SoundMoment } from '@/utils/sounds';
import appearanceCatalog from '../../../../shared/appearance-presets.json';
import imageCatalog from '../../lib/appearance-image-presets-data';
import { childThemeTokens } from './child-notebook-theme';

import { coverColors, coverPatterns, coverSymbols } from '../../../../shared/child-notebook';
export { coverColors, coverPatterns, coverSymbols };
export const childImageChoices = imageCatalog.presets;
export const childImageUrl = (image: typeof childImageChoices[number]) => `${imageCatalog.basePath}/${image.mode}/${image.file}`;
export type CoverSymbol = typeof coverSymbols[number];
type CoverPattern = typeof coverPatterns[number];
type CoverColor = typeof coverColors[number];
type ChildAppearance = { scheme: 'system' | 'light' | 'dark'; darkCanvas: string; canvas: string; textSize: 'standard' | 'bigger'; reduceMotion: boolean };
type Identity = {
  coverColor: CoverColor; setCoverColor: Dispatch<SetStateAction<CoverColor>>;
  coverSymbol: CoverSymbol; setCoverSymbol: Dispatch<SetStateAction<CoverSymbol>>;
  coverPattern: CoverPattern; setCoverPattern: Dispatch<SetStateAction<CoverPattern>>;
  resolvedScheme: 'light' | 'dark'; themeStyle: CSSProperties;
  appearance: ChildAppearance; setAppearance: Dispatch<SetStateAction<ChildAppearance>>;
  soundPreference: SoundPreference;
  setSoundPreference: Dispatch<SetStateAction<SoundPreference>>;
  playCue: (moment: SoundMoment) => void;
};
const ChildAppearanceContext = createContext<Identity | null>(null);

/** Fictional child preferences only: no parent appearance writes or browser persistence. */
export function ChildNotebookAppearanceProvider({ children }: { children: ReactNode }) {
  const [coverColor, setCoverColor] = useState<CoverColor>(coverColors[0]);
  const [coverSymbol, setCoverSymbol] = useState<CoverSymbol>('initial');
  const [coverPattern, setCoverPattern] = useState<CoverPattern>('plain');
  const [appearance, setAppearance] = useState<ChildAppearance>({ scheme: 'system', canvas: 'device', darkCanvas: 'device', textSize: 'standard', reduceMotion: false });
  const [soundPreference, setSoundPreference] = useState(DEFAULT_SOUND_PREFERENCE);
  const playCue = useCallback((moment: SoundMoment) => playSound(moment, { preference: soundPreference }), [soundPreference]);
  useEffect(() => {
    if (soundPreference !== 'off') warmSounds({ force: true });
  }, [soundPreference]);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const resolvedScheme = appearance.scheme === 'system' ? (systemDark ? 'dark' : 'light') : appearance.scheme;
  const preference = resolvedScheme === 'dark' ? appearance.darkCanvas : appearance.canvas;
  const selectedId = preference.startsWith('image:') ? preference : 'device';
  const selectedImage = childImageChoices.find(choice => `image:${choice.id}` === selectedId);
  const defaultCanvas = resolvedScheme === 'dark' ? appearanceCatalog.canvasDefaultDarkHex : appearanceCatalog.canvasDefaultLightHex;
  const canvas = defaultCanvas;
  const themeStyle = { ...childThemeTokens(resolvedScheme), '--kids-cover-color': coverColor.color, '--kids-cover-ink': 'color-mix(in oklab, var(--kids-cover-color) 65%, var(--pds-text-primary))', '--kids-canvas': canvas, '--kids-canvas-image': selectedImage ? `url("${childImageUrl(selectedImage)}")` : 'none' } as CSSProperties;
  return <ChildAppearanceContext.Provider value={{ coverColor, setCoverColor, coverSymbol, setCoverSymbol, coverPattern, setCoverPattern, resolvedScheme, themeStyle, appearance, setAppearance, soundPreference, setSoundPreference, playCue }}>
    <div className="pds-kids-appearance-scope" data-color-scheme={resolvedScheme} data-canvas={selectedId} data-text-size={appearance.textSize} data-reduce-motion={appearance.reduceMotion ? 'true' : undefined} style={themeStyle}>{children}</div>
  </ChildAppearanceContext.Provider>;

}
export function useChildNotebookAppearance() {
  const identity = useContext(ChildAppearanceContext);
  if (!identity) throw new Error('Child notebook appearance requires its provider.');
  return identity;
}

export function ChildNotebookAvatar({ small = false }: { small?: boolean }) {
  const { coverColor, coverSymbol, coverPattern } = useChildNotebookAppearance();
  return <span className="pds-kids-avatar" data-small={small ? 'true' : undefined} data-pattern={coverPattern} aria-hidden="true" style={{ '--kids-cover-color': coverColor.color, '--kids-cover-ink': 'color-mix(in oklab, var(--kids-cover-color) 65%, var(--pds-text-primary))' } as CSSProperties}>
    <span className="pds-kids-avatar__cover proto-ink-on-accent">{coverSymbol === 'initial' ? <span>S</span> : <Icon name={coverSymbol} size={small ? 12 : 19} />}</span>
  </span>;
}
