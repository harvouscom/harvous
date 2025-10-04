import React from 'react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Star, Trophy, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

interface XPCounterProps {
  xp: number;
  level?: number;
  showLevel?: boolean;
  showBadges?: boolean;
  className?: string;
}

export const XPCounter: React.FC<XPCounterProps> = ({
  xp,
  level = 1,
  showLevel = true,
  showBadges = true,
  className
}) => {
  const getLevelFromXP = (xp: number) => {
    return Math.floor(xp / 100) + 1;
  };

  const getXPForNextLevel = (currentLevel: number) => {
    return currentLevel * 100;
  };

  const getXPProgress = (xp: number, level: number) => {
    const currentLevelXP = (level - 1) * 100;
    const nextLevelXP = level * 100;
    const progress = ((xp - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
    return Math.min(100, Math.max(0, progress));
  };

  const currentLevel = showLevel ? level : getLevelFromXP(xp);
  const progress = getXPProgress(xp, currentLevel);
  const xpToNext = getXPForNextLevel(currentLevel) - xp;

  const getBadges = (level: number) => {
    const badges = [];
    if (level >= 5) badges.push({ icon: Star, label: 'Star', color: 'text-yellow-500' });
    if (level >= 10) badges.push({ icon: Trophy, label: 'Trophy', color: 'text-orange-500' });
    if (level >= 20) badges.push({ icon: Zap, label: 'Lightning', color: 'text-blue-500' });
    return badges;
  };

  const badges = showBadges ? getBadges(currentLevel) : [];

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">XP: {xp}</span>
            {showLevel && (
              <Badge variant="secondary" className="text-xs">
                Level {currentLevel}
              </Badge>
            )}
          </div>
          {badges.length > 0 && (
            <div className="flex items-center space-x-1">
              {badges.map((badge, index) => (
                <badge.icon key={index} className={cn("h-4 w-4", badge.color)} />
              ))}
            </div>
          )}
        </div>
        
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        <p className="text-xs text-muted-foreground mt-1">
          {xpToNext > 0 ? `${xpToNext} XP to next level` : 'Max level reached!'}
        </p>
      </CardContent>
    </Card>
  );
};
