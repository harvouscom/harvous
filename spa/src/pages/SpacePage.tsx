import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useUser } from '@clerk/clerk-react';
import { useSpace } from '../hooks/queries/useSpace';
import SpaceContentList from '../../../src/components/react/SpaceContentList';
import SpaceCardStackHeader from '../../../src/components/react/SpaceCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import CardStack from '../components/CardStack';

type SpaceFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

const TABS: Array<{ id: SpaceFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'threads',   label: 'Threads' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
];

export default function SpacePage() {
  const { spaceId: spaceSlug } = useParams({ strict: false }) as { spaceId: string };
  // URL param is the slug (e.g. "ghi789"); DB + API need the full prefixed ID
  const spaceId = spaceSlug.startsWith('space_') ? spaceSlug : `space_${spaceSlug}`;
  const { user } = useUser();
  const { data: space, isLoading } = useSpace(spaceId);
  const [filter, setFilter] = useState<SpaceFilter>('all');

  const headerBgColor = space?.color
    ? `var(--color-${space.color})`
    : 'var(--color-paper)';

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  if (isLoading) {
    return (
      <CardStack title="Loading..." headerBgColor="var(--color-paper)" centerTitle>
        <div className="page-loading" />
      </CardStack>
    );
  }

  return (
    <CardStack
      title={space?.title ?? 'Space'}
      headerBgColor={headerBgColor}
      header={space ? (
        <SpaceCardStackHeader
          initialTitle={space.title}
          initialColor={(space.color ?? 'paper') as any}
          spaceId={spaceId}
          currentUserId={user?.id}
        />
      ) : undefined}
    >
      <TabNav
        tabs={tabs}
        onTabChange={(id) => setFilter(id as SpaceFilter)}
      />
      <SpaceContentList
        initialItems={[]}
        spaceId={spaceId}
        filter={filter}
      />
    </CardStack>
  );
}
