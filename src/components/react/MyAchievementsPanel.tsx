import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';
import Icon from './Icon';

interface MyAchievementsPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

interface SeasonData {
  season: string;
  seasonName: string;
  totalXP: number;
}

interface XPData {
  seasonalXP: number;
  lifetimeXP: number;
  seasonName: string;
  allSeasons: SeasonData[];
}

export default function MyAchievementsPanel({ 
  onClose,
  inBottomSheet = false
}: MyAchievementsPanelProps) {
  const [xpData, setXpData] = useState<XPData>({
    seasonalXP: 0,
    lifetimeXP: 0,
    seasonName: '',
    allSeasons: []
  });
  const [showPastSeasons, setShowPastSeasons] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/user/achievements', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setXpData({
          seasonalXP: data.seasonalXP || 0,
          lifetimeXP: data.lifetimeXP || 0,
          seasonName: data.seasonName || '',
          allSeasons: data.allSeasons || []
        });
      }
    } catch (error) {
      console.error('Error loading achievements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      {/* Content area - expands on mobile, fits content on desktop */}
      <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
        {/* Panel container */}
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          {/* Header section */}
          <div className="panel__header">
            <div className="panel__title">
              <p>My Achievements</p>
            </div>
          </div>
          
          {/* Content area */}
          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`} style={{ gap: '1rem' }}>
              {isLoading ? (
                <div className="panel__loading">
                  Loading achievements...
                </div>
              ) : (
                <>
                  {/* XP Summary Cards */}
                  <div className="panel__grid">
                    {/* Seasonal XP Card */}
                    <div className="panel__grid-card">
                      <Icon name="sun" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                      <div>
                        <div className="panel__grid-card-value">{xpData.seasonalXP.toLocaleString()} XP</div>
                        <div className="panel__grid-card-label">{xpData.seasonName}</div>
                      </div>
                    </div>

                    {/* Lifetime XP Card */}
                    <div className="panel__grid-card">
                      <Icon name="trophy" size={20} style={{ color: 'var(--color-deep-grey)' }} />
                      <div>
                        <div className="panel__grid-card-value">{xpData.lifetimeXP.toLocaleString()} XP</div>
                        <div className="panel__grid-card-label">All Time</div>
                      </div>
                    </div>
                  </div>

                  {/* Past Seasons Section - Only show if user has multiple seasons */}
                  {xpData.allSeasons.length > 0 && (
                    <div className="w-full">
                      <button
                        onClick={() => setShowPastSeasons(!showPastSeasons)}
                        className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                        style={{
                          backgroundImage: 'var(--color-gradient-gray)',
                        }}
                      >
                        <div className="panel__list-item">
                          <div className="panel__list-item-text" style={{ textAlign: 'left' }}>
                            <span className="panel__list-item-label" style={{ textAlign: 'left' }}>
                              Past Seasons
                            </span>
                          </div>
                          <div className="p-[20px] flex-shrink-0">
                            <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
                              <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                                {xpData.allSeasons.length}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>

                      {showPastSeasons && (
                        <div className="mt-3 space-y-2">
                          {xpData.allSeasons.map((season) => (
                            <div
                              key={season.season}
                              className="bg-white border border-[var(--color-fog-white)] rounded-xl p-3 flex items-center justify-between"
                            >
                              <span className="text-sm text-[var(--color-deep-grey)]">
                                {season.seasonName}
                              </span>
                              <span className="text-sm font-semibold text-[var(--color-deep-grey)]">
                                {season.totalXP.toLocaleString()} XP
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Milestones and Badges Coming Soon */}
                  <div className="w-full">
                    <div className="text-sm text-[var(--color-pebble-grey)] italic text-center">
                      Milestones and Badges coming soon
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        {/* Back button - SquareButton Back variant */}
        <SquareButton 
          variant="Back"
          onClick={handleClose}
          inBottomSheet={inBottomSheet}
        />
      </div>
    </div>
  );
}
