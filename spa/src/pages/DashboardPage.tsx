import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import OrganizedContentList from '../../../src/components/react/OrganizedContentList';
import TabNav from '../../../src/components/react/TabNav';

type DashboardFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

const TABS: Array<{ id: DashboardFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'threads',   label: 'Threads' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
];

export default function DashboardPage() {
  const { user } = useUser();
  const [filter, setFilter] = useState<DashboardFilter>('all');

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  return (
    <div className="dashboard-page">
      <TabNav
        tabs={tabs}
        onTabChange={(id) => setFilter(id as DashboardFilter)}
        className="dashboard-tab-nav"
      />
      <OrganizedContentList
        // Empty initial items — component fetches from /api/content/load-more on mount
        initialItems={[]}
        filter={filter}
        userId={user?.id}
        dataGeneratedAt={Date.now()}
      />
    </div>
  );
}
