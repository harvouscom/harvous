import { useNavigate } from '@tanstack/react-router';
import NewSpacePanel from '../../../src/components/react/NewSpacePanel';

export default function NewSpacePage() {
  const navigate = useNavigate();

  return (
    <div className="new-space-page">
      <NewSpacePanel
        onClose={() => navigate({ to: '/dashboard' })}
        onSpaceCreated={() => navigate({ to: '/dashboard' })}
        inBottomSheet={false}
      />
    </div>
  );
}
