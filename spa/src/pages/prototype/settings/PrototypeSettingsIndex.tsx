import { Navigate, useNavigate } from '@tanstack/react-router';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useProfile } from '../../../hooks/queries/useProfile';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { SETTINGS_CATEGORIES } from './settingsCategories';
import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';
import SettingsAdminShortcut from './SettingsAdminShortcut';

/**
 * Index for /prototype/settings.
 * Wide: the two-pane layout already lists every category in its nav, so redirect
 * to the default (Account) detail pane.
 * Narrow: render the category list (drilldown entry point) — tapping a row pushes
 * into that category's detail route.
 */
export default function PrototypeSettingsIndex() {
  const { isMobileSidebar } = useProtoShell();
  const navigate = useNavigate();
  const { data: profile } = useProfile();

  if (!isMobileSidebar) {
    return <Navigate to={SETTINGS_CATEGORIES[0].route} replace />;
  }

  const translationLabel = profile?.defaultTranslation
    ? getTranslationAbbreviationDisplay(profile.defaultTranslation)
    : undefined;

  const lockPinLabel =
    profile?.hasLockPinSet === undefined ? undefined : profile.hasLockPinSet ? 'Set' : 'Not set';

  return (
    <SettingsShell>
      <SettingsGroup>
        {SETTINGS_CATEGORIES.map((cat) => (
          <SettingsRow
            key={cat.key}
            label={cat.title}
            sublabel={cat.footnote}
            value={
              cat.key === 'translation'
                ? translationLabel
                : cat.key === 'lockPin'
                  ? lockPinLabel
                  : undefined
            }
            onClick={() => navigate({ to: cat.route })}
          />
        ))}
      </SettingsGroup>
      <div className="proto-settings__admin-row-wrap">
        <SettingsAdminShortcut variant="row" />
      </div>
    </SettingsShell>
  );
}
