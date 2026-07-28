import Icon, { type IconName } from '@/components/react/Icon';

export type ProtoChipOption<T extends string> = {
  id: T;
  label: string;
  iconName?: string;
};

/**
 * Segmented chip tablist — same pattern as sidebar list scope and search filters.
 */
export default function ProtoChipBar<T extends string>({
  ariaLabel,
  options,
  selectedId,
  onSelect,
}: {
  ariaLabel: string;
  options: readonly ProtoChipOption<T>[];
  selectedId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="proto-chip-bar" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
            onClick={() => onSelect(opt.id)}
          >
            {opt.iconName ? <Icon name={opt.iconName as IconName} size={11} aria-hidden /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
