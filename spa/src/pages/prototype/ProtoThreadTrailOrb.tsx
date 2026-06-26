import Icon from '@/components/react/Icon';

/** Trail spine marker — gradient check when active, hollow ring when idle. */
export default function ProtoThreadTrailOrb({ active = false }: { active?: boolean }) {
  return (
    <span className="proto-thread-trail__orb" aria-hidden>
      {active ? (
        <span className="proto-accent-check-orb">
          <Icon name="check" size={11} />
        </span>
      ) : (
        <span className="proto-select-orb-idle" />
      )}
    </span>
  );
}
