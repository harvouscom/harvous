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

const HarvousLogo = () => (
  <svg width="28" height="40" viewBox="0 0 45 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Harvous">
    <path d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z" fill="#fff"/>
  </svg>
);

export default function UpgradePage() {
  const [data, setData] = useState<UpgradeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = 'Upgrade - Harvous';
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

  return (
    <div className="auth-page">
      <div className="auth-page__container">
        {/* Left Column: Animated Mesh Gradient Background */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://harvous.com" className="auth-page__logo-container">
              <HarvousLogo />
            </a>
          </div>
        </div>

        {/* Right Column: Upgrade Content */}
        <div className="auth-page__form-section">
          <div className="auth-page__form-wrapper">
            <div className="clerk-form-card">
              {isLoading ? (
                <div className="page-loading" />
              ) : (
                <UpgradePageContent
                  initialHasUnlimited={data?.hasUnlimited ?? false}
                  initialCurrentCount={data?.currentCount ?? 0}
                  initialLimit={data?.limit ?? 0}
                  limitsInfo={data?.limitsInfo ?? { currentCount: 0, limit: 0 }}
                  publishableKey={null}
                  unlimitedPlanId={import.meta.env.VITE_CLERK_UNLIMITED_PLAN_ID ?? ''}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
