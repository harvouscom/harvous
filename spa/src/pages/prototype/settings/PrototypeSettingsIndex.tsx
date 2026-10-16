import { Navigate, useNavigate } from '@tanstack/react-router';
import { prototypeSettingsAccountRouteTo } from '@/lib/prototype-path';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useSubscriptionStatus } from '../../../hooks/queries/useSubscriptionStatus';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { useSettingsCategories } from './settingsCategories';
import { SettingsShell, SettingsGroup, SettingsRow } from './SettingsShell';
import SettingsAdminShortcut from './SettingsAdminShortcut';
import { playSound } from '@/utils/sounds';

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
  const categories = useSettingsCategories();
  const { data: subscription } = useSubscriptionStatus();

  if (!isMobileSidebar) {
    // Typed route — string hrefs from SETTINGS_CATEGORIES can miss the route tree and
    // flash TanStack's default `<p>Not Found</p>` in the settings Outlet.
    return <Navigate to={prototypeSettingsAccountRouteTo()} replace />;
  }

  const translationLabel = profile?.defaultTranslation
    ? getTranslationAbbreviationDisplay(profile.defaultTranslation)
    : undefined;

  const planLabel = subscription ? (subscription.hasSharedSpaces ? 'Plus' : 'Free') : undefined;

  const groups: (typeof categories)[] = [];
  for (const cat of categories) {
    const last = groups[groups.length - 1];
    if (last && last[0]!.group === cat.group) last.push(cat);
    else groups.push([cat]);
  }

  const lockPinLabel =
    profile?.hasLockPinSet === undefined ? undefined : profile.hasLockPinSet ? 'Set' : 'Not set';

  return (
    <SettingsShell>
      {/* One group per run, the same runs the wide nav separates with a gap. */}
      {groups.map((run) => (
        <SettingsGroup key={run[0]!.group}>
          {run.map((cat) => (
            <SettingsRow
              key={cat.key}
              label={cat.title}
              sublabel={cat.footnote}
              value={
                cat.key === 'bible'
                  ? translationLabel
                  : cat.key === 'addons'
                    ? planLabel
                    : cat.key === 'lockPin'
                      ? lockPinLabel
                      : undefined
              }
              onClick={() => {
                playSound('nav.drillIn');
                navigate({ to: cat.route as '/settings/account' });
              }}
            />
          ))}
        </SettingsGroup>
      ))}
      <div className="proto-settings__admin-row-wrap">
        <SettingsAdminShortcut variant="row" />
      </div>
    </SettingsShell>
  );
}
