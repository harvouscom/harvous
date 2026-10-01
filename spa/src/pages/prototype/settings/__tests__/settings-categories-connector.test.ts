import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFeatureWithheld } from '@/lib/billing-plans';
import { SETTINGS_CATEGORIES } from '../settingsCategories';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Claude & ChatGPT in the settings list', () => {
  it('is a real category, so it is listed for everyone once launched', () => {
    expect(SETTINGS_CATEGORIES.some((c) => c.key === 'connector')).toBe(true);
  });

  it('while withheld, appears only for preview accounts', () => {
    expect(isFeatureWithheld('connector')).toBe(true);
    const text = source('spa/src/pages/prototype/settings/settingsCategories.ts');
    expect(text).toContain("!isFeatureWithheld('connector') || Boolean(data?.connectorPreview)");
  });

  it('both settings surfaces read the filtered list, never the raw constant', () => {
    for (const f of ['PrototypeSettingsIndex.tsx', 'PrototypeSettingsLayout.tsx']) {
      const text = source(`spa/src/pages/prototype/settings/${f}`);
      expect(text).toContain('useSettingsCategories()');
      expect(text).not.toMatch(/SETTINGS_CATEGORIES\.(map|find)/);
    }
  });

  it('the server only grants the preview flag to listed accounts that hold the key', () => {
    const text = source('server/utils/subscription.ts');
    expect(text).toContain("previewUserIds().has(userId)");
    expect(text).toContain(".includes('connector')");
  });
});
