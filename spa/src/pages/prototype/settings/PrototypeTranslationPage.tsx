import Icon from '@/components/react/Icon';
import { TRANSLATION_ORDER, getTranslation } from '@/data/translations';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateTranslation } from '../../../hooks/mutations/useUpdateTranslation';
import { SettingsGroup, SettingsShell } from './SettingsShell';

export default function PrototypeTranslationPage() {
  const { data: profile } = useProfile();
  const updateTranslation = useUpdateTranslation();

  // Optimistic selection: pending value if mutating, else server value, else NET.
  const selected =
    (updateTranslation.isPending ? updateTranslation.variables : undefined) ??
    profile?.defaultTranslation ??
    'NET';

  return (
    <SettingsShell>
      <SettingsGroup>
        {TRANSLATION_ORDER.map((id) => {
          const t = getTranslation(id);
          const isSelected = id === selected;
          return (
            <button
              key={id}
              type="button"
              className="proto-note-row"
              data-active={isSelected ? 'true' : undefined}
              onClick={() => {
                if (updateTranslation.isPending || isSelected) return;
                updateTranslation.mutate(id);
              }}
            >
              <span className="proto-settings-list-row__main">
                <span className="pds-list-title" style={{ display: 'block' }}>{t?.abbreviation ?? id}</span>
                {t?.name ? (
                  <span className="pds-list-preview" style={{ display: 'block', marginTop: 2 }}>
                    {t.name}
                  </span>
                ) : null}
              </span>
              <span className="proto-settings-list-row__trailing proto-settings-list-row__trailing--orb" aria-hidden>
                {isSelected ? (
                  <span className="proto-accent-check-orb">
                    <Icon name="check" size={11} />
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </SettingsGroup>
      {updateTranslation.isError ? (
        <p style={{ color: 'var(--pds-destructive)', fontSize: '0.8125rem', padding: '0 12px' }}>
          Couldn't save. Please try again.
        </p>
      ) : null}
    </SettingsShell>
  );
}
