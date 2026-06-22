import appearanceImagePresetsCatalog from '../../../shared/appearance-image-presets.json';

export type AppearanceImagePresetsCatalog = {
  basePath: string;
  presets: {
    id: string;
    label: string;
    file: string;
    mode: 'light' | 'dark';
    tintLight?: string | null;
    tintDark?: string | null;
  }[];
};

const catalog = appearanceImagePresetsCatalog as AppearanceImagePresetsCatalog;

export default catalog;
