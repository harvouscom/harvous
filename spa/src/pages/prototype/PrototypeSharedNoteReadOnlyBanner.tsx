import Icon from '@/components/react/Icon';

export default function PrototypeSharedNoteReadOnlyBanner() {
  return (
    <div className="proto-shared-readonly-banner" role="status" aria-live="polite">
      <Icon name="eye" size={12} className="proto-shared-readonly-banner__icon" aria-hidden />
      <span className="proto-shared-readonly-banner__text">View only</span>
    </div>
  );
}
