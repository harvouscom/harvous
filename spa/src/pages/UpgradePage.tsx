import { useEffect, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import UpgradePageContent, { type LimitsInfo } from '../../../src/components/react/UpgradePageContent';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import DevModeBadge from '../components/DevModeBadge';
import { isSiteInspiredAuthHost } from '@/lib/prototype-path';
import { useAuthHeroImage } from '../hooks/useAuthHeroImage';
import { api } from '../lib/api';

interface UpgradeData {
  hasSharedSpaces: boolean;
  limitsInfo: LimitsInfo | null;
}

const HarvousLogo = () => (
  <svg width="28" height="40" viewBox="0 0 45 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Harvous">
    <path d="M44.8037 63.9941H0.0078125V0H44.8037V63.9941ZM34.5645 31.168C25.6988 34.2637 18.5024 41.2949 15.3711 50.543L14.2842 53.752H34.5645V31.168ZM10.2471 37.8643C15.8921 29.2487 24.5827 23.0353 34.5645 20.4824V10.2393H10.2471V37.8643Z" fill="#fff"/>
  </svg>
);

export default function UpgradePage() {
  const [data, setData] = useState<UpgradeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const siteInspired = isSiteInspiredAuthHost();
  const { heroImage, isReady: isHeroReady } = useAuthHeroImage();

  useEffect(() => {
    sonnerToast.dismiss();
    Promise.all([
      api.get<{ hasSharedSpaces: boolean }>('/api/subscription/status'),
      api.get<LimitsInfo>('/api/user/limits'),
    ])
      .then(([sub, limits]) => setData({
        hasSharedSpaces: sub.hasSharedSpaces,
        limitsInfo: limits,
      }))
      .catch(() => setData(null))
      .finally(() => setIsLoading(false));
  }, []);

  const upgradeContent = isLoading ? (
    <div className="page-loading" />
  ) : (
    <SubtleContentMount>
      <UpgradePageContent
        initialHasSharedSpaces={data?.hasSharedSpaces ?? false}
        limitsInfo={data?.limitsInfo ?? null}
        publishableKey={null}
        sharedSpacesPlanId={import.meta.env.VITE_CLERK_SHARED_SPACES_PLAN_ID ?? ''}
      />
    </SubtleContentMount>
  );

  if (siteInspired) {
    return (
      <>
        <title>Upgrade | Harvous</title>
        <div className="auth-page auth-page--site">
          <DevModeBadge />
          <div className="auth-page__container">
            <div className="auth-page__video-section">
              <div
                className={`auth-page__hero-bg${isHeroReady ? ' auth-page__hero-bg--ready' : ''}`}
                style={isHeroReady ? { backgroundImage: `url(${heroImage})` } : undefined}
                aria-hidden
              />
              <div className="auth-page__video-overlay">
                <a href="https://harvous.com" className="auth-page__logo-container">
                  <img
                    src="/images/harvous-2-icon.png"
                    alt="Harvous"
                    className="auth-page__logo"
                    width={64}
                    height={64}
                  />
                </a>
              </div>
            </div>

            <div className="auth-page__form-section">
              <div className="auth-letter-stack">
                <div className="auth-letter-stack__leaf auth-letter-stack__leaf--back" aria-hidden />
                <div className="auth-letter-stack__leaf auth-letter-stack__leaf--mid" aria-hidden />
                <div className="auth-letter">
                  <h1 className="auth-page__headline">
                    Study <span className="auth-page__headline-mark">together</span>.
                  </h1>
                  <div className="auth-page__form-wrapper">{upgradeContent}</div>
                </div>
              </div>

              <div className="auth-page__footer">
                <p className="auth-page__footer-switch">
                  Not right now?<a href="/">Back to my Harvous →</a>
                </p>
                <p className="auth-page__secured-by">Secured by Clerk</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <title>Upgrade | Harvous</title>
    <div className="auth-page">
      <div className="auth-page__container">
        {/* Left Column: Animated Mesh Gradient Background */}
        <div className="auth-page__video-section thread-colors-mesh-gradient">
          <div className="auth-page__video-overlay" style={{ padding: '24px' }}>
            <a href="https://app.harvous.com" className="auth-page__logo-container">
              <HarvousLogo />
            </a>
          </div>
        </div>

        {/* Right Column: Upgrade Content */}
        <div className="auth-page__form-section">
          <div className="auth-page__form-wrapper">
            <div className="clerk-form-card">{upgradeContent}</div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
