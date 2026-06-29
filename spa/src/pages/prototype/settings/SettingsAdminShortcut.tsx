import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { useHarvousAdminCheck } from '@/hooks/queries/useVotdPreview';
import { prototypeAdminRouteTo } from '@/lib/prototype-path';
import { SettingsRow } from './SettingsShell';

type Props = {
  /** Pinned footer in the wide settings nav column. */
  variant: 'nav' | 'row' | 'card';
};

export default function SettingsAdminShortcut({ variant }: Props) {
  const navigate = useNavigate();
  const admin = useHarvousAdminCheck();

  if (!admin.data?.isAdmin) {
    return null;
  }

  const goAdmin = () => navigate({ to: prototypeAdminRouteTo() });

  if (variant === 'nav') {
    return (
      <div className="proto-settings__nav-footer">
        <button
          type="button"
          className="proto-settings__nav-item proto-settings__admin-shortcut"
          onClick={goAdmin}
        >
          <span className="proto-settings__nav-icon" aria-hidden>
            <Icon name="user-shield" size={15} />
          </span>
          <span className="proto-settings__admin-shortcut-text">
            <span className="proto-settings__nav-title">Harvous Admin</span>
            <span className="proto-settings__admin-shortcut-sub">Usage, pulse & more</span>
          </span>
        </button>
      </div>
    );
  }

  if (variant === 'row') {
    return (
      <SettingsRow
        label="Harvous Admin"
        sublabel="Usage, publishing, and support"
        onClick={goAdmin}
      />
    );
  }

  return (
    <button
      type="button"
      className="proto-glass-surface proto-glass-surface--panel proto-settings__admin-card"
      onClick={goAdmin}
    >
      <span className="proto-settings__admin-card-icon" aria-hidden>
        <Icon name="user-shield" size={14} />
      </span>
      <span className="proto-settings__admin-card-body">
        <span className="pds-list-title proto-settings__admin-card-title">Harvous Admin</span>
        <span className="pds-list-preview proto-settings__admin-card-preview">
          Usage, publishing, and support tools
        </span>
      </span>
      <span className="proto-settings__admin-card-chevron" aria-hidden>
        <Icon name="caret-right" size={11} />
      </span>
    </button>
  );
}
