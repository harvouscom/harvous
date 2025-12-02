import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';
import SunIcon from "@fortawesome/fontawesome-free/svgs/solid/sun.svg";
import TrophyIcon from "@fortawesome/fontawesome-free/svgs/solid/trophy.svg";

interface MyAchievementsPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

interface XPData {
  seasonalXP: number;
  lifetimeXP: number;
  seasonName: string;
}

export default function MyAchievementsPanel({ 
  onClose,
  inBottomSheet = false
}: MyAchievementsPanelProps) {
  const [xpData, setXpData] = useState<XPData>({
    seasonalXP: 0,
    lifetimeXP: 0,
    seasonName: ''
  });
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
          seasonName: data.seasonName || ''
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
    <div className="h-full flex flex-col min-h-0">
      {/* Content area - expands on mobile, fits content on desktop */}
      <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
        {/* Single unified panel using CardStack structure */}
        <div className={`bg-white box-border flex flex-col items-start ${inBottomSheet ? "min-h-0 flex-1 justify-between" : "justify-start"} overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5`}>
          {/* Header section with paper background */}
          <div className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl" style={{ backgroundColor: 'var(--color-paper)', color: 'var(--color-deep-grey)' }}>
            <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
              <p className="leading-[normal]">My Achievements</p>
            </div>
          </div>
          
          {/* Content area */}
          <div className={inBottomSheet ? "flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full" : "box-border content-stretch flex flex-col items-start justify-start mb-[-24px] overflow-clip relative w-full"}>
            <div className={inBottomSheet ? "flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full" : "bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start overflow-x-clip p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full"}>
              {isLoading ? (
                <div className="flex items-center justify-center py-12 w-full">
                  <div className="text-[var(--color-pebble-grey)]">Loading achievements...</div>
                </div>
              ) : (
                <>
                  {/* XP Summary Cards */}
                  <div className="grid grid-cols-2 w-full" style={{ gap: '12px' }}>
                    {/* Seasonal XP Card */}
                    <div className="bg-white border border-[var(--color-fog-white)] rounded-2xl p-4 flex items-center gap-3">
                      <img src={SunIcon.src} alt="Sun" className="w-5 h-5" style={{ color: 'var(--color-deep-grey)' }} />
                      <div>
                        <div className="text-lg font-bold text-[var(--color-deep-grey)]">{xpData.seasonalXP.toLocaleString()} XP</div>
                        <div className="text-sm text-[var(--color-pebble-grey)]">{xpData.seasonName}</div>
                      </div>
                    </div>

                    {/* Lifetime XP Card */}
                    <div className="bg-white border border-[var(--color-fog-white)] rounded-2xl p-4 flex items-center gap-3">
                      <img src={TrophyIcon.src} alt="Trophy" className="w-5 h-5" style={{ color: 'var(--color-deep-grey)' }} />
                      <div>
                        <div className="text-lg font-bold text-[var(--color-deep-grey)]">{xpData.lifetimeXP.toLocaleString()} XP</div>
                        <div className="text-sm text-[var(--color-pebble-grey)]">All Time</div>
                      </div>
                    </div>
                  </div>

                  {/* Milestones and Badges Coming Soon */}
                  <div className="w-full pt-4">
                    <div className="text-sm text-[var(--color-pebble-grey)] italic text-center">
                      Milestones and Badges coming soon!
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
