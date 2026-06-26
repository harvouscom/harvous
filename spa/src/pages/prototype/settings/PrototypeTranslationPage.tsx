import Icon from '@/components/react/Icon';
import { TRANSLATION_ORDER, getTranslation } from '@/data/translations';
import { useProfile } from '../../../hooks/queries/useProfile';
import { useUpdateTranslation } from '../../../hooks/mutations/useUpdateTranslation';
import { SettingsGroup, SettingsIntro, SettingsShell } from './SettingsShell';

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
      <SettingsIntro>The translation used across the app.</SettingsIntro>
      <SettingsGroup>
        {TRANSLATION_ORDER.map((id) => {
          const t = getTranslation(id);
          const isSelected = id === selected;
          return (
            <button
              key={id}
              type="button"
              className="proto-note-row"
              onClick={() => {
                if (updateTranslation.isPending || isSelected) return;
                updateTranslation.mutate(id);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '12px',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--pds-text-primary)',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span className="pds-list-title" style={{ display: 'block' }}>{t?.abbreviation ?? id}</span>
                {t?.name ? (
                  <span className="pds-list-preview" style={{ display: 'block', marginTop: 2, color: 'var(--pds-text-secondary)' }}>
                    {t.name}
                  </span>
                ) : null}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--pds-accent)', width: 16 }} aria-hidden>
                {isSelected ? <Icon name="check" size={14} /> : null}
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
