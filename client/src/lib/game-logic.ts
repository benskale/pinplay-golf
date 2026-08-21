import type { Game } from "@shared/schema";
import type { GameConfig } from "@shared/game-config";
import { scoreHoleWithConfig } from "./config-scoring";
import { presetToConfig } from "./preset-mappings";

// ─── Game Definitions ─────────────────────────────────────────────────────────

export interface GameDef {
  id: string;
  name: string;
  description: string;
  detailedDescription?: string;  // expanded "How to Play" text shown in UI
  playerCounts: number[];
  isTeamGame: boolean; // requires team assignment in setup
  needsHandicap: boolean;
  carryover: boolean; // skins-style carryover option
  specialInputs?: string[]; // extra per-hole inputs needed beyond strokes
  customizable?: boolean;  // game supports custom settings (point values, etc.)
}

// ─── Mini-Game Definitions ────────────────────────────────────────────────────

export interface MiniGameDef {
  id: string;
  name: string;
  description: string;
  playerCounts: number[];        // which player counts are eligible
  gameTypes: string[] | null;    // null = all games, otherwise restrict
  defaultValue: number;          // default dollar amount
  valueLabel: string;            // "each", "buy-in", "per point", etc.
  inputType: "achievement" | "winner" | "auto";  // how input works
  holeFilter?: "par3" | "par5";  // only show on certain hole types (undefined = all)
}

export const MINI_GAME_DEFINITIONS: Record<string, MiniGameDef> = {
  sandies: {
    id: "sandies", name: "Sandies", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Make par or better after hitting into a bunker. Earn the amount for each sandy.",
    defaultValue: 1, valueLabel: "each", inputType: "achievement",
  },
  polies: {
    id: "polies", name: "Polies", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Sink a putt from farther than the length of the flagstick.",
    defaultValue: 1, valueLabel: "each", inputType: "achievement",
  },
  chippies: {
    id: "chippies", name: "Chippies", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Chip in from off the green. Any holed shot that wasn't a putt.",
    defaultValue: 1, valueLabel: "each", inputType: "achievement",
  },
  birdie_pool: {
    id: "birdie_pool", name: "Birdie Pool", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Everyone buys in. Most birdies (and eagles) at the end takes the pot.",
    defaultValue: 5, valueLabel: "buy-in", inputType: "auto",
  },
  omaha: {
    id: "omaha", name: "Omaha", playerCounts: [3], gameTypes: null,
    description: "Low ball (1 pt) and low total (1 pt) each hole. Teams rotate every 6 holes. Settle by points.",
    defaultValue: 1, valueLabel: "per point", inputType: "auto",
  },
  snake: {
    id: "snake", name: "Snake", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Last player to 3-putt holds the snake. Whoever holds it at the end owes every other player the set amount.",
    defaultValue: 1, valueLabel: "per player", inputType: "achievement",
  },
  rabbit: {
    id: "rabbit", name: "Rabbit", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Win a hole outright to catch the rabbit. Hold it after 9 or 18 to earn the amount.",
    defaultValue: 5, valueLabel: "per 9", inputType: "auto",
  },
  press: {
    id: "press", name: "Press", playerCounts: [2], gameTypes: ["match_play", "nassau", "best_ball_2"],
    description: "Double the bet on remaining holes. Can be pressed by either side at any time.",
    defaultValue: 5, valueLabel: "base bet", inputType: "winner",
  },
  trash: {
    id: "trash", name: "Trash / Junk", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Birdies, sandies, chippies, and greenies (par 3s) each pay the set amount.",
    defaultValue: 1, valueLabel: "each", inputType: "achievement",
  },
  longest_drive: {
    id: "longest_drive", name: "Longest Drive", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Longest drive in the fairway on par 5s. Must be in the short grass to count.",
    defaultValue: 0, valueLabel: "bragging rights", inputType: "winner",
    holeFilter: "par5",
  },
  closest_to_pin: {
    id: "closest_to_pin", name: "Closest to the Pin", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Closest to the hole on par 3s. Must be on the green to count.",
    defaultValue: 0, valueLabel: "bragging rights", inputType: "winner",
    holeFilter: "par3",
  },
  greenies: {
    id: "greenies", name: "Greenies", playerCounts: [2, 3, 4, 5], gameTypes: null,
    description: "Closest to the pin on par 3s, must be on the green in regulation. Winner takes the amount on each par 3.",
    defaultValue: 2, valueLabel: "per par 3", inputType: "winner",
    holeFilter: "par3",
  },
};

export function getMiniGamesForSetup(playerCount: number, gameType: string): MiniGameDef[] {
  return Object.values(MINI_GAME_DEFINITIONS).filter(mg => {
    if (!mg.playerCounts.includes(playerCount)) return false;
    if (mg.gameTypes && !mg.gameTypes.includes(gameType)) return false;
    return true;
  });
}

export const GAME_DEFINITIONS: Record<string, GameDef> = {
  // ── 2-player ──────────────────────────────────────────────────────
  match_play: {
    id: "match_play", name: "Match Play", playerCounts: [2],
    description: "Hole-by-hole win/loss. Each hole is worth 1 point. Lower net score wins.",
    detailedDescription: "Each hole is a separate contest worth 1 point. The player with the lower net score (after handicap strokes) wins the hole. If scores are tied, the hole is halved (no points). The match is won when one player is ahead by more holes than remain. Handicap strokes are applied on the hardest holes based on your course's stroke index.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  stroke_play: {
    id: "stroke_play", name: "Stroke Play", playerCounts: [2, 3, 4, 5],
    description: "Total strokes for the round. Lowest score wins.",
    detailedDescription: "The classic format: count every stroke for the entire round. Lowest total gross score wins. No handicaps applied in this format - it's pure golf. Simple and straightforward.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  nassau: {
    id: "nassau", name: "Nassau", playerCounts: [2],
    description: "Three separate match-play bets: front 9, back 9, and total 18.",
    detailedDescription: "Three bets in one round: (1) Front 9 match play, (2) Back 9 match play, (3) Overall 18 match play. Each is a separate contest worth 1 unit. The 'press' is a common Nassau side bet that starts a new bet when one player is dormie or loses. Track all three bets simultaneously.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  skins: {
    id: "skins", name: "Skins", playerCounts: [2, 3, 4, 5],
    description: "Lowest score wins the hole outright. Ties carry the skin to the next hole.",
    detailedDescription: "Every hole is worth a 'skin' (1 point). To win a skin, you must have the lowest score outright - ties don't count. If two or more players tie for the low score, the skin carries over to the next hole, making it worth 2 skins. Carries can accumulate across multiple holes, creating big payouts. The pressure builds with each carryover hole.",
    isTeamGame: false, needsHandicap: false, carryover: true,
  },
  alternate_shot: {
    id: "alternate_shot", name: "Alternate Shot", playerCounts: [2],
    description: "Partners alternate hitting the same ball. Enter one team score per hole.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  best_ball_2: {
    id: "best_ball_2", name: "Best Ball", playerCounts: [2],
    description: "Each player plays their own ball. Lower net score from each player counts.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  par_birdie: {
    id: "par_birdie", name: "Par/Birdie Points", playerCounts: [2],
    description: "Par=1pt, Birdie=2pts, Eagle=4pts, Bogey=0. Most points wins.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  // ── 3-player ──────────────────────────────────────────────────────
  wolf_3: {
    id: "wolf_3", name: "Wolf (3-player)", playerCounts: [3],
    description: "Wolf rotates each hole. Wolf goes alone (+2) or picks partner (+1 each).",
    detailedDescription: "The Wolf rotates each hole. Choose Wolf's hitting order: Wolf goes Last (watches both drives, then picks partner or goes solo) or Wolf goes First (tees off first, decides without seeing other drives). Going solo pays 2x. 'Blind Wolf' can be declared before anyone tees off for 3x stakes.",
    isTeamGame: false, needsHandicap: false, carryover: false, customizable: true,
  },
  sixes: {
    id: "sixes", name: "Sixes / Round Robin", playerCounts: [3],
    description: "18 holes split into 3 groups of 6. Partners rotate so everyone teams with everyone.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  skins_3: {
    id: "skins_3", name: "3-Man Skins", playerCounts: [3],
    description: "Lowest score wins the skin. Ties carry to the next hole.",
    isTeamGame: false, needsHandicap: false, carryover: true,
  },
  split_sixes: {
    id: "split_sixes", name: "Split Sixes", playerCounts: [3],
    description: "6-hole best-ball match play segments. Partners rotate each 6 holes.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  nine_point: {
    id: "nine_point", name: "9-Point", playerCounts: [3],
    description: "9 points per hole split by finish: 1st=5pts, 2nd=3pts, 3rd=1pt. Ties split the combined points.",
    detailedDescription: "Every hole is worth exactly 9 points. The player with the lowest score gets 5 points, 2nd gets 3 points, 3rd gets 1 point. If two players tie, they split the combined points (e.g. tie for 1st = 4pts each). If all three tie, everyone gets 3 points. The points always add up to 9. Great equalizer - every hole matters.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  bingo_bango_bongo: {
    id: "bingo_bango_bongo", name: "Bingo Bango Bongo", playerCounts: [3],
    description: "3 pts per hole: first on green (Bingo), closest to pin (Bango), first to hole out (Bongo).",
    isTeamGame: false, needsHandicap: false, carryover: false,
    specialInputs: ["bingo", "bango", "bongo"],
  },
  // ── 4-player ──────────────────────────────────────────────────────
  best_ball_4: {
    id: "best_ball_4", name: "Best Ball (2v2)", playerCounts: [4, 5],
    description: "Two teams. Best score from each team counts per hole. Match play format.",
    detailedDescription: "Two teams of two players. Everyone plays their own ball the entire hole. The best (lowest) net score from each team counts. Those two scores are compared match-play style - lower net score wins the hole for that team. Handicap strokes apply based on each player's handicap.",
    isTeamGame: true, needsHandicap: true, carryover: false,
  },
  scramble: {
    id: "scramble", name: "Scramble", playerCounts: [4, 5],
    description: "Best shot from each team counts. Two teams, enter one score each.",
    detailedDescription: "The classic scramble format! Two teams compete - everyone tees off, then the team picks the best shot and all team members play their next shot from that spot. Repeat until the ball is holed. Enter one team score per hole. For 5 players, teams are 2v3. Strategy: mix safe and aggressive shots so you always have a good option.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  alternate_shot_4: {
    id: "alternate_shot_4", name: "Alternate Shot (Foursomes)", playerCounts: [4, 5],
    description: "Two teams of 2. Partners alternate hitting the same ball. Stroke play or match play.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  shamble: {
    id: "shamble", name: "Shamble", playerCounts: [4, 5],
    description: "Best tee shot chosen for all. Each player then plays their own ball. Best ball counts.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  nassau_4: {
    id: "nassau_4", name: "Nassau (2v2)", playerCounts: [4, 5],
    description: "Two teams compete in three bets: front 9, back 9, and 18 total (match play).",
    isTeamGame: true, needsHandicap: true, carryover: false,
  },
  skins_4: {
    id: "skins_4", name: "Skins", playerCounts: [4],
    description: "Lowest individual score wins the skin. Ties carry to the next hole.",
    isTeamGame: false, needsHandicap: false, carryover: true,
  },
  wolf_5: {
    id: "wolf_5", name: "Wolf (5-Player)", playerCounts: [5],
    description: "Wolf picks a partner (2v3) or goes Lone Wolf (1v4, double stakes).",
    detailedDescription: "5-player Wolf. Wolf tees LAST — after watching all four drives, pick one partner (best ball 2v3) or go Lone Wolf against all four. Wolf rotates holes 1-15 so everyone is Wolf 3 times, then holes 16-18 go to the three players with the fewest wolf points (furthest behind takes 18). Team hole: pair +1.5 each vs trio +1 each. Lone Wolf: +8 vs -8. Ties on best ball push. Optional Gammens hole plays for double.",
    isTeamGame: false, needsHandicap: false, carryover: false, customizable: true,
  },
  wolf: {
    id: "wolf", name: "Wolf", playerCounts: [4],
    description: "Rotating Wolf picks a partner or goes alone. Best ball vs best ball.",
    detailedDescription: "The most strategic 4-player game. Wolf rotates each hole. Choose Wolf's hitting order: Wolf goes Last (watches all drives, then picks partner or goes solo) or Wolf goes First (tees off first, decides partner or solo without seeing other drives). Going solo pays 3x if you win, but costs 3x if you lose. 'Blind Wolf' can be declared before anyone tees off for maximum stakes. Best ball of each side is compared.",
    isTeamGame: false, needsHandicap: false, carryover: false, customizable: true,
  },
  vegas: {
    id: "vegas", name: "Vegas", playerCounts: [4],
    description: "Two teams. Scores are combined as a 2-digit number (e.g. 4&5=45). Lower number wins the difference in points.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  hammer: {
    id: "hammer", name: "Hammer", playerCounts: [2, 3, 4, 5],
    description: "Any player can double the bet ('Hammer'). Lower score wins the current bet value.",
    isTeamGame: false, needsHandicap: false, carryover: false,
    specialInputs: ["hammer"],
  },
  stableford: {
    id: "stableford", name: "Quota / Stableford", playerCounts: [2, 3, 4, 5],
    description: "Points per hole: Eagle=5, Birdie=4, Par=3, Bogey=2, Dbl Bogey=1, Worse=0. Quota = 36 minus handicap.",
    detailedDescription: "Point-based scoring where higher is better. Each hole earns points based on your net score relative to par: Eagle (2-under) = 5pts, Birdie (1-under) = 4pts, Par = 3pts, Bogey (1-over) = 2pts, Double Bogey (2-over) = 1pt, Worse = 0. Your quota target = 36 minus your handicap. Beat your quota and you're in the money.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  dots_junk: {
    id: "dots_junk", name: "Dots / Junk", playerCounts: [2, 3, 4, 5],
    description: "Base stroke play with bonus dots for birdies (+1), eagles (+2), sandies (+1), greenies (+1 on par 3s).",
    isTeamGame: false, needsHandicap: false, carryover: false,
    specialInputs: ["dots"],
  },
  banker: {
    id: "banker", name: "Banker", playerCounts: [4],
    description: "One rotating Banker plays three individual matches simultaneously. Win/loss against the Banker.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  // ── MULTI-TEAM GAMES (6+ players) ─────────────────────────────────
  team_best_ball: {
    id: "team_best_ball", name: "Team Best Ball", playerCounts: [5],
    description: "Multi-team best ball. Best net score per team counts. Lowest team score wins each hole.",
    detailedDescription: "For groups of 6 or more. Split into 2-5 teams. Everyone plays their own ball. The best (lowest) net score from each team counts toward the team total. Lowest team score wins the hole. Handicap strokes apply per player.",
    isTeamGame: true, needsHandicap: true, carryover: false,
  },
  team_scramble: {
    id: "team_scramble", name: "Team Scramble", playerCounts: [5],
    description: "Multi-team scramble. Best shot from each team counts. One team score per hole.",
    detailedDescription: "For groups of 6 or more. Split into 2-5 teams. Everyone tees off, team picks the best shot, all play from there. Repeat until holed. Enter one team score per hole. Lowest team score wins.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
};

export function getGamesForPlayerCount(count: number): GameDef[] {
  // For 6+ players, show games that scale to any count (those supporting 5+)
  if (count >= 6) {
    return Object.values(GAME_DEFINITIONS).filter(g => g.playerCounts.includes(5));
  }
  return Object.values(GAME_DEFINITIONS).filter(g => g.playerCounts.includes(count));
}

export function isLowerBetter(gameType: string): boolean {
  return ["stroke_play", "alternate_shot", "alternate_shot_4", "scramble", "shamble", "team_scramble"].includes(gameType);
}

// ─── Scoring Logic ────────────────────────────────────────────────────────────

export interface HoleResult {
  pointDeltas: Record<string, number>; // Added to totalScores
  result: string;
  metadata: Record<string, any>;
}

/**
 * How many handicap strokes a player receives on one hole.
 *
 * Rule (standard match play):
 *   diff = player's handicap − lowest handicap in the group
 *   → Player gets 1 stroke on every hole whose HCP rank ≤ diff (up to 18).
 *   → If diff > 18, player gets a 2nd stroke on holes where rank ≤ (diff − 18), etc.
 *
 * Example: Ben 12, Nick 8 → diff = 4.
 *   Ben gets 1 stroke on the 4 hardest holes (HCP rank 1, 2, 3, 4).
 *   Nick gets 0 strokes (diff = 0).
 */
function strokesOnHole(
  playerName: string,
  hole: number, // 1-indexed
  handicaps: Record<string, number>,
  players: string[],
  strokeIndexes: number[], // strokeIndexes[i] = HCP rank of hole i+1; 1=hardest, 18=easiest
): number {
  const hdcp = handicaps[playerName] || 0;
  const lowestHdcp = Math.min(...players.map(p => handicaps[p] || 0));
  const diff = Math.max(0, hdcp - lowestHdcp);
  if (diff === 0) return 0;

  const rank = strokeIndexes[hole - 1] ?? hole; // HCP rank for this hole
  const fullRounds = Math.floor(diff / 18);       // strokes every hole from full 18-stroke passes
  const remainder = diff % 18;                    // extra holes that get one more stroke
  const extra = remainder > 0 && rank <= remainder ? 1 : 0;
  return fullRounds + extra;
}

function netStrokes(
  gross: number,
  playerName: string,
  hole: number,
  handicaps: Record<string, number>,
  players: string[],
  strokeIndexes: number[],
): number {
  return gross - strokesOnHole(playerName, hole, handicaps, players, strokeIndexes);
}

/** Return the course stroke indexes from a game, defaulting to [1..18] */
function getStrokeIndexes(game: Game): number[] {
  return Array.isArray(game.strokeIndexes) && game.strokeIndexes.length === 18
    ? game.strokeIndexes
    : Array.from({ length: 18 }, (_, i) => i + 1);
}

/** Count consecutive tied (no-skin-winner) holes at end of history */
function skinCarryCount(holeHistory: Game["holeHistory"]): number {
  let count = 0;
  for (let i = holeHistory.length - 1; i >= 0; i--) {
    if (holeHistory[i].metadata?.skinCarried) count++;
    else break;
  }
  return count;
}

export function calcHoleResult(
  game: Game,
  hole: number,
  par: number,
  inputStrokes: Record<string, number>,
  extraMeta: Record<string, any> = {},
): HoleResult {
  // Phase 2: Route through config-driven scoring engine
  const storedConfig = (game as any).gameConfig;
  const config: GameConfig | null =
    storedConfig && typeof storedConfig === "object" && Object.keys(storedConfig).length > 0
      ? (storedConfig as GameConfig)
      : presetToConfig({ gameType: game.gameType, playerNames: game.players, teams: game.teams });

  if (config) {
    return scoreHoleWithConfig(game, config, {
      hole,
      par,
      strokes: inputStrokes,
      metadata: extraMeta,
    });
  }

  // Fallback for unknown game types with no config
  const deltas: Record<string, number> = {};
  game.players.forEach(p => { deltas[p] = 0; });
  return { pointDeltas: deltas, result: "Hole complete", metadata: {} };
}

/**
 * Returns how many handicap strokes each player receives on a given hole.
 * Re-uses the same strokesOnHole() rule used for actual scoring.
 */
export function getStrokesReceivedOnHole(game: Game, hole: number): Record<string, number> {
  const { players, handicaps } = game;
  const si = getStrokeIndexes(game);
  const result: Record<string, number> = {};
  players.forEach(p => {
    result[p] = strokesOnHole(p, hole, handicaps, players, si);
  });
  return result;
}

/**
 * Returns the list of holes (1-indexed) where a player receives at least 1 stroke.
 * Useful for the "stroke allocation summary" shown in the game UI.
 */
export function getStrokeHoles(game: Game, playerName: string): number[] {
  const si = getStrokeIndexes(game);
  const holes: number[] = [];
  for (let h = 1; h <= 18; h++) {
    if (strokesOnHole(playerName, h, game.handicaps, game.players, si) > 0) {
      holes.push(h);
    }
  }
  return holes;
}

// ─── Leaderboard & Display ────────────────────────────────────────────────────

export interface LeaderboardEntry {
  player: string;
  score: number;
  displayScore: string;
  rank: number;
}

export function getLeaderboard(game: Game): LeaderboardEntry[] {
  const { players, totalScores, gameType, holeHistory, handicaps } = game;
  const lower = isLowerBetter(gameType);
  const holesPlayed = holeHistory.length;

  const entries = players.map(p => {
    const raw = totalScores[p] || 0;
    let displayScore = "";

    if (["stroke_play", "scramble", "alternate_shot", "alternate_shot_4", "shamble"].includes(gameType)) {
      const diff = raw - (game.pars.slice(0, holesPlayed).reduce((a, b) => a + b, 0));
      displayScore = holesPlayed === 0 ? "E" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
    } else if (["match_play", "nassau", "best_ball_2"].includes(gameType)) {
      const [p1, p2] = players;
      const p1Score = totalScores[p1] || 0;
      const p2Score = totalScores[p2] || 0;
      const diff = (p === p1) ? p1Score - p2Score : p2Score - p1Score;
      const remaining = 18 - holesPlayed;
      if (diff > remaining) displayScore = `${diff} up (won)`;
      else if (diff > 0) displayScore = `${diff} up`;
      else if (diff === 0) displayScore = "AS";
      else displayScore = `${Math.abs(diff)} dn`;
    } else if (["best_ball_4", "nassau_4"].includes(gameType)) {
      displayScore = `${raw} holes`;
    } else if (["team_best_ball"].includes(gameType)) {
      displayScore = `${raw} hole${raw !== 1 ? "s" : ""}`;
    } else if (["team_scramble"].includes(gameType)) {
      const diff = raw - (game.pars.slice(0, holesPlayed).reduce((a, b) => a + b, 0));
      displayScore = holesPlayed === 0 ? "E" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;
    } else if (["skins", "skins_3", "skins_4"].includes(gameType)) {
      displayScore = `${raw} skin${raw !== 1 ? "s" : ""}`;
    } else if (["hammer", "banker", "dots_junk", "nine_point"].includes(gameType)) {
      displayScore = raw >= 0 ? `+${raw}` : `${raw}`;
    } else {
      displayScore = `${raw}`;
    }

    return { player: p, score: lower ? -raw : raw, displayScore };
  });

  entries.sort((a, b) => b.score - a.score);
  let rank = 1;
  return entries.map((e, i) => {
    if (i > 0 && e.score < entries[i - 1].score) rank = i + 1;
    return { ...e, rank };
  });
}

export function getGameStatus(game: Game): string {
  const { gameType, holeHistory, currentHole, players, totalScores, teams } = game;
  const holesLeft = 18 - holeHistory.length;
  if (holesLeft === 0) return "Round complete";

  if (["match_play", "nassau", "best_ball_2"].includes(gameType)) {
    const [p1, p2] = players;
    const diff = (totalScores[p1] || 0) - (totalScores[p2] || 0);
    if (diff === 0) return `All Square · ${holesLeft} to play`;
    const leader = diff > 0 ? p1 : p2;
    const upBy = Math.abs(diff);
    if (upBy > holesLeft) return `${leader.split(" ")[0]} wins ${upBy}&${holesLeft}`;
    return `${leader.split(" ")[0]} ${upBy} UP · ${holesLeft} to play`;
  }

  if (["best_ball_4", "nassau_4"].includes(gameType)) {
    const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
    const scoreA = teamA.reduce((s, p) => s + (totalScores[p] || 0), 0);
    const scoreB = teamB.reduce((s, p) => s + (totalScores[p] || 0), 0);
    if (scoreA === scoreB) return `All Square · ${holesLeft} to play`;
    const leader = scoreA > scoreB ? teamA : teamB;
    const up = Math.abs(scoreA - scoreB);
    return `${leader.map(p => p.split(" ")[0]).join("+")} ${up} UP · ${holesLeft} to play`;
  }

  if (gameType === "team_best_ball") {
    const teamList = teams.length >= 2 ? teams : [players.slice(0, Math.ceil(players.length / 2)), players.slice(Math.ceil(players.length / 2))];
    const teamTotals = teamList.map(team => ({
      name: team.map(p => p.split(" ")[0]).join("+"),
      holes: team.reduce((s, p) => s + (totalScores[p] || 0), 0),
    }));
    const sorted = [...teamTotals].sort((a, b) => b.holes - a.holes);
    const leader = sorted[0];
    const second = sorted[1];
    if (leader.holes === second.holes) return `Tied at ${leader.holes} · ${holesLeft} to play`;
    return `${leader.name} ${leader.holes - second.holes} UP · ${holesLeft} to play`;
  }

  if (gameType === "team_scramble") {
    const teamList = teams.length >= 2 ? teams : [players.slice(0, Math.ceil(players.length / 2)), players.slice(Math.ceil(players.length / 2))];
    const teamTotals = teamList.map(team => ({
      name: team.map(p => p.split(" ")[0]).join("+"),
      score: (totalScores[team[0]] || 0),
    }));
    const sorted = [...teamTotals].sort((a, b) => a.score - b.score);
    const leader = sorted[0];
    return `${leader.name} ${leader.score} strokes · ${holesLeft} to play`;
  }

  if (["skins", "skins_3", "skins_4"].includes(gameType)) {
    const totalSkins = Object.values(totalScores).reduce((s, v) => s + v, 0);
    return `${totalSkins} skins won · ${holesLeft} to play`;
  }

  return `Hole ${currentHole} · ${holesLeft} holes left`;
}

/** For wolf-style games: returns the current "rotating player" name */
export function getCurrentRotatingPlayer(game: Game): string {
  return game.players[game.currentWolfIndex % game.players.length];
}

/** Pairs for team games */
export function getTeams(game: Game): string[][] {
  if (game.teams && game.teams.length === 2) return game.teams;
  return [[game.players[0], game.players[1]], [game.players[2], game.players[3]]];
}

/**
 * Determines the two "sides" for the Press system.
 * Team games use defined teams; individual games split players in half.
 */
export function getPressSides(game: Game): { sideA: string[]; sideB: string[] } {
  if (game.teams && game.teams.length === 2 && game.teams[0].length > 0 && game.teams[1].length > 0) {
    return { sideA: game.teams[0], sideB: game.teams[1] };
  }
  if (game.players.length === 2) {
    return { sideA: [game.players[0]], sideB: [game.players[1]] };
  }
  const mid = Math.ceil(game.players.length / 2);
  return { sideA: game.players.slice(0, mid), sideB: game.players.slice(mid) };
}
