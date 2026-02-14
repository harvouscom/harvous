import { useEffect, useState } from 'react';
import UpgradePageContent from '../../../src/components/react/UpgradePageContent';
import { api } from '../lib/api';

interface LimitsInfo {
  currentCount: number;
  limit: number;
  [key: string]: unknown;
}

interface UpgradeData {
  hasUnlimited: boolean;
  currentCount: number;
  limit: number;
  limitsInfo: LimitsInfo;
}

export default function UpgradePage() {
  const [data, setData] = useState<UpgradeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ hasUnlimited: boolean; currentCount: number; limit: number }>('/api/subscription/status'),
      api.get<LimitsInfo>('/api/user/limits'),
    ])
      .then(([sub, limits]) => setData({
        hasUnlimited: sub.hasUnlimited,
        currentCount: sub.currentCount,
        limit: sub.limit,
        limitsInfo: limits,
      }))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="page-loading" />;
  }

  return (
    <UpgradePageContent
      initialHasUnlimited={data?.hasUnlimited ?? false}
      initialCurrentCount={data?.currentCount ?? 0}
      initialLimit={data?.limit ?? 0}
      limitsInfo={data?.limitsInfo ?? { currentCount: 0, limit: 0 }}
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      unlimitedPlanId={import.meta.env.VITE_CLERK_UNLIMITED_PLAN_ID ?? ''}
    />
  );
}
