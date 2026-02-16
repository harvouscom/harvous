import { useNavigate } from '@tanstack/react-router';
import NewSpacePanel from '../../../src/components/react/NewSpacePanel';

export default function NewSpacePage() {
  const navigate = useNavigate();

  return (
    <div style={{ width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
      <NewSpacePanel
        onClose={() => navigate({ to: '/dashboard' })}
        inBottomSheet={false}
      />
    </div>
  );
}
