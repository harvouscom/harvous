import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import Icon from '@/components/react/Icon';
import { DEFAULT_SOUND_PREFERENCE, type SoundPreference } from '@/utils/sound-prefs';
import { playSound, warmSounds, type SoundMoment } from '@/utils/sounds';
import appearanceCatalog from '../../../../shared/appearance-presets.json';
import imageCatalog from '../../lib/appearance-image-presets-data';
import { childThemeTokens } from './child-notebook-theme';

import { coverColors, coverPatterns, coverSymbols, defaultChildPreferences, type ChildNotebookPreferences } from '../../../../shared/child-notebook';
export { coverColors, coverPatterns, coverSymbols };
export const childImageChoices = imageCatalog.presets;
export const childImageUrl = (image: typeof childImageChoices[number]) => `${imageCatalog.basePath}/${image.mode}/${image.file}`;
export type CoverSymbol = typeof coverSymbols[number];
type CoverPattern = typeof coverPatterns[number];
type CoverColor = typeof coverColors[number];
type ChildAppearance = { scheme: 'system' | 'light' | 'dark'; darkCanvas: string; canvas: string; textSize: 'standard' | 'bigger'; reduceMotion: boolean };
type Identity = { name: string; preferences: ChildNotebookPreferences;
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

function coverStyle(color: CoverColor): CSSProperties {
  return {
    '--kids-cover-color': color.color,
    '--kids-cover-ink': 'color-mix(in oklab, var(--kids-cover-color) 65%, var(--pds-text-primary))'
  } as CSSProperties;
}

/** Fictional child preferences only: no parent appearance writes or browser persistence. */
export function ChildNotebookAppearanceProvider({ children, name = 'Sam', initial }: {
  children: ReactNode; name?: string; initial?: ChildNotebookPreferences;
}) {
  const [coverColor, setCoverColor] = useState<CoverColor>(() => coverColors.find(color => color.id === initial?.coverColor) ?? coverColors[0]);
  const [coverSymbol, setCoverSymbol] = useState<CoverSymbol>(initial?.coverSymbol ?? 'initial');
  const [coverPattern, setCoverPattern] = useState<CoverPattern>(initial?.coverPattern ?? 'plain');
  const [appearance, setAppearance] = useState<ChildAppearance>({ scheme: initial?.scheme ?? 'system', canvas: initial?.canvas ?? 'device', darkCanvas: initial?.darkCanvas ?? 'device', textSize: initial?.textSize ?? 'standard', reduceMotion: initial?.reduceMotion ?? false });
  const [soundPreference, setSoundPreference] = useState<SoundPreference>(initial?.soundMode ?? (initial ? initial.sounds ? 'everywhere' : 'off' : DEFAULT_SOUND_PREFERENCE));
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
  const themeStyle = { ...childThemeTokens(resolvedScheme), ...coverStyle(coverColor), '--kids-canvas': canvas, '--kids-canvas-image': selectedImage ? `url("${childImageUrl(selectedImage)}")` : 'none' } as CSSProperties;
  const preferences: ChildNotebookPreferences = { coverColor: coverColor.id, coverPattern, coverSymbol,
    scheme: appearance.scheme, canvas: appearance.canvas, darkCanvas: appearance.darkCanvas, textSize: appearance.textSize,
    reduceMotion: appearance.reduceMotion, sounds: soundPreference !== 'off', soundMode: soundPreference };
  return <ChildAppearanceContext.Provider value={{ name, preferences, coverColor, setCoverColor, coverSymbol, setCoverSymbol, coverPattern, setCoverPattern, resolvedScheme, themeStyle, appearance, setAppearance, soundPreference, setSoundPreference, playCue }}>
    <div className="pds-kids-appearance-scope" data-color-scheme={resolvedScheme} data-canvas={selectedId} data-text-size={appearance.textSize} data-reduce-motion={appearance.reduceMotion ? 'true' : undefined} style={themeStyle}>{children}</div>
  </ChildAppearanceContext.Provider>;

}
export function useChildNotebookAppearance() {
  const identity = useContext(ChildAppearanceContext);
  if (!identity) throw new Error('Child notebook appearance requires its provider.');
  return identity;
}

export function ChildNotebookCover({ name, preferences, large = false }: {
  name: string;
  preferences: ChildNotebookPreferences | null;
  large?: boolean;
}) {
  const { coverColor, coverPattern, coverSymbol } = preferences ?? defaultChildPreferences;
  const color = coverColors.find(option => option.id === coverColor) ?? coverColors[0];
  return <span className={large ? 'pds-kids-book pds-kids-book--settings' : 'pds-kids-book'}
    aria-hidden="true" data-pattern={coverPattern} style={coverStyle(color)}>
    <span className="pds-kids-book__volume">
      <span className="pds-kids-book__back" />
      <span className="pds-kids-book__page" data-page="1" />
      <span className="pds-kids-book__page" data-page="2" />
      <span className="pds-kids-book__page" data-page="3" />
      <span className="pds-kids-book__front proto-ink-on-accent">
        {coverSymbol === 'initial' ? <span>{Array.from(name)[0]?.toUpperCase()}</span> : <Icon name={coverSymbol} size={large ? 40 : 18} />}
      </span>
    </span>
  </span>;
}

export function ChildNotebookAvatar({ small = false }: { small?: boolean }) {
  const { name, preferences } = useChildNotebookAppearance();
  return <ChildNotebookProfileAvatar name={name} preferences={preferences} small={small} />;
}

export function ChildNotebookProfileAvatar({ name, preferences, small = false }: {
  name: string;
  preferences: ChildNotebookPreferences | null;
  small?: boolean;
}) {
  const coverColor = coverColors.find(color => color.id === preferences?.coverColor) ?? coverColors[0];
  const coverSymbol = preferences?.coverSymbol ?? 'initial';
  const coverPattern = preferences?.coverPattern ?? 'plain';
  return <span className="pds-kids-avatar" data-small={small ? 'true' : undefined} data-pattern={coverPattern} aria-hidden="true" style={coverStyle(coverColor)}>
    <span className="pds-kids-avatar__cover proto-ink-on-accent">{coverSymbol === 'initial' ? <span>{Array.from(name)[0]?.toUpperCase()}</span> : <Icon name={coverSymbol} size={small ? 12 : 19} />}</span>
  </span>;
}
