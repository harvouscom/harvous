import { useParams } from '@tanstack/react-router';
import SpaceContentList from '../../../src/components/react/SpaceContentList';

export default function SpacePage() {
  const { spaceId } = useParams({ from: '/s/$spaceId' });

  return (
    <div className="space-page">
      <SpaceContentList
        initialItems={[]}
        spaceId={spaceId}
        filter="all"
      />
    </div>
  );
}
