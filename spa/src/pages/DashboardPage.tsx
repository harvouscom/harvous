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

  // Use React Query cache as seed data for OrganizedContentList.
  // staleTime=30s means navigating back to dashboard within 30s uses cached items
  // instantly — no empty-state flash. OrganizedContentList still does its own
  // authoritative fetch to stay fresh; this just provides an immediate first render.
  const { data: cachedContent } = useDashboardContent(filter, 100);
  const cachedItems = cachedContent?.pages.flatMap(p => p.items) ?? [];

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
        onNavigate={(href) => navigate({ to: href as any })}
      />
    </CardStack>
  );
}
