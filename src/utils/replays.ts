import { Replay } from '../types';

const REPLAYS_PREFIX = 'osutouch_replays_';

// Pre-seeded legendary replays for the built-in tutorial map
const DEFAULT_REPLAYS: Record<string, Replay[]> = {
  'built-in-synthwave-tutorial': [
    {
      id: 'default-replay-cookiezi',
      beatmapId: 'built-in-synthwave-tutorial',
      playerName: 'Cookiezi',
      score: 998400,
      maxCombo: 240,
      accuracy: 100,
      date: '01.06.2026',
    },
    {
      id: 'default-replay-osubot',
      beatmapId: 'built-in-synthwave-tutorial',
      playerName: 'osu!Bot',
      score: 842100,
      maxCombo: 212,
      accuracy: 94.65,
      date: '31.05.2026',
    },
    {
      id: 'default-replay-wubwoof',
      beatmapId: 'built-in-synthwave-tutorial',
      playerName: 'WubWoofWolf',
      score: 712000,
      maxCombo: 185,
      accuracy: 91.20,
      date: '28.05.2026',
    }
  ]
};

/**
 * Get all replays for a specific beatmap difficulty
 */
export function getReplaysForBeatmap(beatmapId: string): Replay[] {
  const defaults = DEFAULT_REPLAYS[beatmapId] || [];
  
  const storageKey = `${REPLAYS_PREFIX}${beatmapId}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return defaults;
  }
  
  try {
    const userReplays = JSON.parse(raw) as Replay[];
    return [...defaults, ...userReplays];
  } catch (e) {
    console.error('Failed to parse replays for', beatmapId, e);
    return defaults;
  }
}

/**
 * Save a new replay record
 */
export function saveReplay(beatmapId: string, replayData: Omit<Replay, 'id'>): Replay {
  const storageKey = `${REPLAYS_PREFIX}${beatmapId}`;
  
  // Get existing user-defined replays only for editing/saving
  let userReplays: Replay[] = [];
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    try {
      userReplays = JSON.parse(raw);
    } catch (e) {
      userReplays = [];
    }
  }

  const newReplay: Replay = {
    ...replayData,
    id: `replay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  };

  userReplays.unshift(newReplay); // newest first
  localStorage.setItem(storageKey, JSON.stringify(userReplays));

  return newReplay;
}

/**
 * Delete a specific replay
 */
export function deleteReplay(beatmapId: string, replayId: string): void {
  const storageKey = `${REPLAYS_PREFIX}${beatmapId}`;
  
  let userReplays: Replay[] = [];
  const raw = localStorage.getItem(storageKey);
  if (raw) {
    try {
      userReplays = JSON.parse(raw);
    } catch (e) {
      userReplays = [];
    }
  }

  const filtered = userReplays.filter(r => r.id !== replayId);
  localStorage.setItem(storageKey, JSON.stringify(filtered));
}
