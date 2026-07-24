import { Navigate, useNavigate } from '@tanstack/react-router';
import { prototypeSettingsAccountRouteTo } from '@/lib/prototype-path';
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
    // Typed route — string hrefs from SETTINGS_CATEGORIES can miss the route tree and
    // flash TanStack's default `<p>Not Found</p>` in the settings Outlet.
    return <Navigate to={prototypeSettingsAccountRouteTo()} replace />;
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
            onClick={() => navigate({ to: cat.route as '/settings/account' })}
          />
        ))}
      </SettingsGroup>
      <div className="proto-settings__admin-row-wrap">
        <SettingsAdminShortcut variant="row" />
      </div>
    </SettingsShell>
  );
}
