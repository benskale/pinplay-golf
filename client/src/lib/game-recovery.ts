/**
 * Guest Game Recovery
 *
 * Persists active games to localStorage so they survive page refreshes,
 * tab closures, and inactivity timeouts. Works without authentication.
 *
 * When a game is completed, it's cleaned up from localStorage.
 */

const STORAGE_KEY = "pinplay:active-games";
const MAX_STORED = 5; // keep at most 5 most recent active games

export interface TrackedGame {
  id: string;
  gameType: string;
  players: string[];
  courseName: string;
  currentHole: number;
  active: boolean;
  createdAt: string;
  // minimal subset needed for "Continue Round" banner
}

function read(): TrackedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrackedGame[];
  } catch {
    return [];
  }
}

function write(games: TrackedGame[]) {
  try {
    // Keep only active + most recent
    const active = games.filter(g => g.active);
    const inactive = games.filter(g => !g.active);
    const trimmed = [...active, ...inactive].slice(0, MAX_STORED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage might be full or unavailable — silently fail
  }
}

/** Track or update a game in localStorage (called on game creation + updates). */
export function trackGame(game: {
  id: string;
  gameType: string;
  players: string[];
  courseName?: string;
  currentHole?: number;
  active?: boolean;
}) {
  const games = read();
  const existing = games.findIndex(g => g.id === game.id);

  const entry: TrackedGame = {
    id: game.id,
    gameType: game.gameType,
    players: game.players,
    courseName: game.courseName ?? "",
    currentHole: game.currentHole ?? 1,
    active: game.active ?? true,
    createdAt: existing >= 0 ? games[existing].createdAt : new Date().toISOString(),
  };

  if (existing >= 0) {
    games[existing] = entry;
  } else {
    games.unshift(entry);
  }

  write(games);
}

/** Mark a game as completed (removes from active tracking). */
export function completeGame(gameId: string) {
  const games = read();
  const filtered = games.filter(g => g.id !== gameId);
  if (filtered.length !== games.length) {
    write(filtered);
  }
}

/** Get all tracked games (for the home page recovery list). */
export function getTrackedGames(): TrackedGame[] {
  return read().filter(g => g.active);
}

/**
 * Resolve tracked games into full Game objects by fetching from the server.
 * Uses the batch resolve endpoint. Games that can't be found are cleaned up.
 */
export async function resolveTrackedGames(): Promise<any[]> {
  const tracked = getTrackedGames();
  if (tracked.length === 0) return [];

  const ids = tracked.map(t => t.id);
  const stillAlive: string[] = [...ids]; // assume alive unless told otherwise

  try {
    const res = await fetch("/api/games/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (res.ok) {
      const data = await res.json();
      const games: any[] = data.games || [];

      // Track which IDs the server still has
      const aliveIds = new Set(games.map((g: any) => g.id));
      stillAlive.length = 0;
      games.forEach((g: any) => stillAlive.push(g.id));

      // Clean up dead entries (server doesn't have them anymore)
      const all = read();
      write(all.filter(g => aliveIds.has(g.id) || !g.active));

      // Sort by most recent hole activity (highest currentHole first)
      return games.sort((a: any, b: any) => b.currentHole - a.currentHole);
    }
  } catch {
    // Network error — keep entries in localStorage, will retry next load
  }

  return [];
}
