import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import OrganizedContentList from '../../../src/components/react/OrganizedContentList';
import TabNav from '../../../src/components/react/TabNav';
import CardStack from '../components/CardStack';
import { useDashboardContent } from '../hooks/queries/useDashboard';

type DashboardFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

const TABS: Array<{ id: DashboardFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'threads',   label: 'Threads' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
];

export default function DashboardPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<DashboardFilter>('all');

  // Use React Query as single source of truth for initial load. OrganizedContentList
  // does not refresh on mount when we have no data (relies on parent to pass initialItems).
  const { data: cachedContent, dataUpdatedAt, isFetching } = useDashboardContent(filter, 100);
  const cachedItems = cachedContent?.pages.flatMap(p => p.items) ?? [];
  const isInitialLoading = cachedItems.length === 0 && isFetching;

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  return (
    <CardStack title="My Home" headerBgColor="var(--color-paper)" centerTitle>
      <TabNav
        tabs={tabs}
        onTabChange={(id) => setFilter(id as DashboardFilter)}
        className="dashboard-tab-nav content-tabs"
      />
      <OrganizedContentList
        initialItems={cachedItems as any}
        filter={filter}
        userId={user?.id}
        dataGeneratedAt={cachedItems.length > 0 ? dataUpdatedAt : undefined}
        onNavigate={(href) => navigate({ to: href as any })}
        parentIsLoading={isInitialLoading}
      />
    </CardStack>
  );
}
