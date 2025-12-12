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
  totalNotes: number;
  scriptureNotes: number;
  resourceNotes: number;
  threadsCreated: number;
}

export default function MyAchievementsPanel({ 
  onClose,
  inBottomSheet = false
}: MyAchievementsPanelProps) {
  const [xpData, setXpData] = useState<XPData>({
    seasonalXP: 0,
    lifetimeXP: 0,
    seasonName: '',
    allSeasons: [],
    totalNotes: 0,
    scriptureNotes: 0,
    resourceNotes: 0,
    threadsCreated: 0
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
          allSeasons: data.allSeasons || [],
          totalNotes: data.totalNotes || 0,
          scriptureNotes: data.scriptureNotes || 0,
          resourceNotes: data.resourceNotes || 0,
          threadsCreated: data.threadsCreated || 0
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

                  {/* Stats Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                    {/* Notes Added Card */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      height: '48px',
                      padding: '0 1rem',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-fog-white)',
                      borderRadius: '0.75rem',
                      gap: '0.75rem'
                    }}>
                      <Icon name="note-sticky" size={16} style={{ color: 'var(--color-deep-grey)', flexShrink: 0 }} />
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flex: 1,
                        minWidth: 0
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '0.875rem',
                          color: 'var(--color-pebble-grey)',
                          whiteSpace: 'nowrap'
                        }}>Notes Added</span>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '1.125rem',
                          fontWeight: 600,
                          color: 'var(--color-deep-grey)',
                          marginLeft: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}>{xpData.totalNotes.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Scripture Notes Card */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      height: '48px',
                      padding: '0 1rem',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-fog-white)',
                      borderRadius: '0.75rem',
                      gap: '0.75rem'
                    }}>
                      <Icon name="scroll" size={16} style={{ color: 'var(--color-deep-grey)', flexShrink: 0 }} />
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flex: 1,
                        minWidth: 0
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '0.875rem',
                          color: 'var(--color-pebble-grey)',
                          whiteSpace: 'nowrap'
                        }}>Scripture Notes</span>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '1.125rem',
                          fontWeight: 600,
                          color: 'var(--color-deep-grey)',
                          marginLeft: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}>{xpData.scriptureNotes.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Resources Added Card */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      height: '48px',
                      padding: '0 1rem',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-fog-white)',
                      borderRadius: '0.75rem',
                      gap: '0.75rem'
                    }}>
                      <Icon name="newspaper" size={16} style={{ color: 'var(--color-deep-grey)', flexShrink: 0 }} />
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flex: 1,
                        minWidth: 0
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '0.875rem',
                          color: 'var(--color-pebble-grey)',
                          whiteSpace: 'nowrap'
                        }}>Resources Added</span>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '1.125rem',
                          fontWeight: 600,
                          color: 'var(--color-deep-grey)',
                          marginLeft: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}>{xpData.resourceNotes.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Threads Added Card */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      height: '48px',
                      padding: '0 1rem',
                      backgroundColor: 'white',
                      border: '1px solid var(--color-fog-white)',
                      borderRadius: '0.75rem',
                      gap: '0.75rem'
                    }}>
                      <Icon name="layer-group" size={16} style={{ color: 'var(--color-deep-grey)', flexShrink: 0 }} />
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flex: 1,
                        minWidth: 0
                      }}>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '0.875rem',
                          color: 'var(--color-pebble-grey)',
                          whiteSpace: 'nowrap'
                        }}>Threads Added</span>
                        <span style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: '1.125rem',
                          fontWeight: 600,
                          color: 'var(--color-deep-grey)',
                          marginLeft: '0.75rem',
                          whiteSpace: 'nowrap'
                        }}>{xpData.threadsCreated.toLocaleString()}</span>
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
      <div className="panel__footer--buttons">
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
