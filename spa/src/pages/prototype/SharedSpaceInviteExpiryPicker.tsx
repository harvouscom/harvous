import {
  INVITE_EXPIRY_PRESETS,
  inviteExpiryMinDateInputValue,
  type InviteExpiryPreset,
} from '../../lib/shared-space-invite-expiry';
import ProtoDatePicker from './ProtoDatePicker';

export interface SharedSpaceInviteExpiryPickerProps {
  preset: InviteExpiryPreset;
  customDate: string;
  onPresetChange: (preset: InviteExpiryPreset) => void;
  onCustomDateChange: (date: string) => void;
  idPrefix?: string;
}

export default function SharedSpaceInviteExpiryPicker({
  preset,
  customDate,
  onPresetChange,
  onCustomDateChange,
  idPrefix = 'invite-expiry',
}: SharedSpaceInviteExpiryPickerProps) {
  const minDate = inviteExpiryMinDateInputValue();
  const dateInputId = `${idPrefix}-date`;

  function selectPreset(next: InviteExpiryPreset) {
    onPresetChange(next);
    if (next === 'custom' && !customDate.trim()) {
      onCustomDateChange(minDate);
    }
  }

  return (
    <div className="proto-shared-invite-expiry">
      <p className="pds-inspector-label proto-shared-invite-expiry__label" id={`${idPrefix}-label`}>
        Link expires
      </p>
      <div
        className="proto-chip-bar proto-shared-invite-expiry__options"
        role="radiogroup"
        aria-labelledby={`${idPrefix}-label`}
      >
        {INVITE_EXPIRY_PRESETS.map((option) => {
          const selected = preset === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
              onClick={() => selectPreset(option.id)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {preset === 'custom' ? (
        <ProtoDatePicker
          id={dateInputId}
          value={customDate}
          min={minDate}
          onChange={onCustomDateChange}
          aria-label="Custom expiration date"
        />
      ) : null}
    </div>
  );
}
