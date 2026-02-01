export const prerender = false;

import type { APIRoute } from 'astro';
import { getSeasonalXP, getLifetimeXP, checkLifetimeMilestones, getAllSeasonalXP } from '@/utils/xp-system';
import { getSeasonDisplayName, getCurrentSeason } from '@/utils/season-helpers';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const [seasonalXP, lifetimeXP, milestoneIds, allSeasons] = await Promise.all([
      getSeasonalXP(userId),
      getLifetimeXP(userId),
      checkLifetimeMilestones(userId),
      getAllSeasonalXP(userId)
    ]);

    // Filter out current season from allSeasons (only show past seasons)
    const currentSeason = getCurrentSeason();
    const pastSeasons = allSeasons.filter(s => s.season !== currentSeason);

    // Define milestone details
    const milestoneDefinitions = [
      { id: 'first_hundred', name: 'First Steps', description: 'Earn 100 lifetime XP', xp: 100 },
      { id: 'five_hundred', name: 'Growing Strong', description: 'Earn 500 lifetime XP', xp: 500 },
      { id: 'thousand', name: 'Thousand Club', description: 'Earn 1,000 lifetime XP', xp: 1000 },
      { id: 'five_thousand', name: 'Five Thousand Club', description: 'Earn 5,000 lifetime XP', xp: 5000 },
      { id: 'ten_thousand', name: 'Ten Thousand Club', description: 'Earn 10,000 lifetime XP', xp: 10000 },
      { id: 'twenty_five_thousand', name: 'Twenty-Five Thousand Club', description: 'Earn 25,000 lifetime XP', xp: 25000 },
      { id: 'fifty_thousand', name: 'Fifty Thousand Club', description: 'Earn 50,000 lifetime XP', xp: 50000 },
    ];

    const milestones = milestoneDefinitions.map(milestone => ({
      ...milestone,
      achieved: milestoneIds.includes(milestone.id)
    }));

    return new Response(JSON.stringify({
      seasonalXP,
      lifetimeXP,
      seasonName: getSeasonDisplayName(),
      milestones,
      allSeasons: pastSeasons
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/achievements',
      action: 'get_achievements'
    });
    return new Response(JSON.stringify({
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

