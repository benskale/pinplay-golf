/**
 * Config Engine Verification Script
 *
 * REAL A/B comparison: runs the original legacy calcHoleResult switch
 * (from legacy-scoring.ts) against the new config-driven engine
 * (scoreHoleWithConfig) for every game type, then reports any mismatches.
 *
 * Run: npx tsx scripts/verify-config-scoring.ts
 */

import { calcHoleResultLegacy } from "../client/src/lib/legacy-scoring";
import { scoreHoleWithConfig } from "../client/src/lib/config-scoring";
import { presetToConfig } from "../client/src/lib/preset-mappings";
import type { Game } from "../shared/schema";
import type { HoleScoreInput } from "../shared/game-config";

// ── Mock game factory ────────────────────────────────────────────────────────

function makeGame(
  gameType: string,
  players: string[],
  options: {
    handicaps?: Record<string, number>;
    teams?: string[][];
    par?: number;
    pars?: number[];
    strokeIndexes?: number[];
    holeHistory?: any[];
    tieCarryover?: boolean;
    currentWolfIndex?: number;
    gameSettings?: Record<string, any>;
  } = {},
): Game {
  const pars = options.pars || Array.from({ length: 18 }, () => options.par || 4);
  return {
    id: "test",
    gameType,
    players,
    handicaps: options.handicaps || {},
    teams: options.teams || [],
    pars,
    strokeIndexes: options.strokeIndexes || Array.from({ length: 18 }, (_, i) => i + 1),
    holeHistory: options.holeHistory || [],
    tieCarryover: options.tieCarryover || false,
    currentWolfIndex: options.currentWolfIndex || 0,
    currentHole: 1,
    totalScores: {},
    startedAt: new Date(),
    completedAt: null,
    active: true,
    miniGames: {},
    gameSettings: options.gameSettings || {},
    gameConfig: {},
    tournamentId: null,
    courseId: null,
  } as unknown as Game;
}

// ── Test cases ───────────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  gameType: string;
  players: string[];
  hole: number;
  par: number;
  strokes: Record<string, number>;
  metadata?: Record<string, any>;
  options?: Parameters<typeof makeGame>[2];
}

const testCases: TestCase[] = [
  // Match play
  {
    name: "match_play P1 wins",
    gameType: "match_play", players: ["Alice", "Bob"], hole: 1, par: 4,
    strokes: { Alice: 4, Bob: 5 },
  },
  {
    name: "match_play halved",
    gameType: "match_play", players: ["Alice", "Bob"], hole: 1, par: 4,
    strokes: { Alice: 5, Bob: 5 },
  },
  {
    name: "match_play P2 wins",
    gameType: "match_play", players: ["Alice", "Bob"], hole: 3, par: 3,
    strokes: { Alice: 4, Bob: 3 },
  },

  // Stroke play
  {
    name: "stroke_play 3p",
    gameType: "stroke_play", players: ["Al", "Bo", "Cy"], hole: 1, par: 4,
    strokes: { Al: 4, Bo: 5, Cy: 3 },
  },
  {
    name: "stroke_play tie",
    gameType: "stroke_play", players: ["Al", "Bo"], hole: 1, par: 4,
    strokes: { Al: 4, Bo: 4 },
  },

  // Skins
  {
    name: "skins winner",
    gameType: "skins", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 5, C: 6, D: 4 },
    options: { tieCarryover: true },
  },
  {
    name: "skins carryover",
    gameType: "skins", players: ["A", "B", "C", "D"], hole: 2, par: 4,
    strokes: { A: 4, B: 4, C: 5, D: 6 },
    options: { tieCarryover: true, holeHistory: [{ metadata: { skinCarried: true } }] },
  },
  {
    name: "skins_3 winner",
    gameType: "skins_3", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4 },
    options: { tieCarryover: true },
  },

  // Nassau
  {
    name: "nassau P1 wins",
    gameType: "nassau", players: ["Alice", "Bob"], hole: 5, par: 4,
    strokes: { Alice: 4, Bob: 5 },
  },
  {
    name: "nassau halved",
    gameType: "nassau", players: ["Alice", "Bob"], hole: 5, par: 4,
    strokes: { Alice: 5, Bob: 5 },
  },

  // Best ball 2
  {
    name: "best_ball_2 P1 wins",
    gameType: "best_ball_2", players: ["Alice", "Bob"], hole: 1, par: 4,
    strokes: { Alice: 4, Bob: 5 },
  },

  // Par/birdie
  {
    name: "par_birdie mixed",
    gameType: "par_birdie", players: ["Alice", "Bob"], hole: 1, par: 4,
    strokes: { Alice: 3, Bob: 4 },
  },

  // Wolf 3-player
  {
    name: "wolf_3 solo win",
    gameType: "wolf_3", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4 },
    metadata: { wolfPlayer: "A", wolfDecision: "alone" },
  },
  {
    name: "wolf_3 partner win",
    gameType: "wolf_3", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4 },
    metadata: { wolfPlayer: "A", wolfDecision: "C" },
  },
  {
    name: "wolf_3 blind win",
    gameType: "wolf_3", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4 },
    metadata: { wolfPlayer: "A", wolfDecision: "blind" },
  },

  // Wolf 4-player
  {
    name: "wolf solo win",
    gameType: "wolf", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4, D: 5 },
    metadata: { wolfPlayer: "A", wolfDecision: "alone" },
  },
  {
    name: "wolf partner win",
    gameType: "wolf", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4, D: 5 },
    metadata: { wolfPlayer: "A", wolfDecision: "B" },
  },
  {
    name: "wolf partner lose",
    gameType: "wolf", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 6, B: 5, C: 4, D: 5 },
    metadata: { wolfPlayer: "A", wolfDecision: "B" },
  },

  // Sixes
  {
    name: "sixes seg1",
    gameType: "sixes", players: ["A", "B", "C"], hole: 3, par: 4,
    strokes: { A: 4, B: 5, C: 3 },
  },
  {
    name: "sixes seg2",
    gameType: "sixes", players: ["A", "B", "C"], hole: 8, par: 4,
    strokes: { A: 4, B: 5, C: 3 },
  },
  {
    name: "sixes seg3",
    gameType: "sixes", players: ["A", "B", "C"], hole: 15, par: 4,
    strokes: { A: 4, B: 5, C: 3 },
  },

  // Split sixes (same scoring as sixes)
  {
    name: "split_sixes seg1",
    gameType: "split_sixes", players: ["A", "B", "C"], hole: 2, par: 4,
    strokes: { A: 3, B: 5, C: 4 },
  },

  // 9-point
  {
    name: "nine_point clear",
    gameType: "nine_point", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 4, C: 5 },
  },
  {
    name: "nine_point tie for 1st",
    gameType: "nine_point", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 3, C: 5 },
  },
  {
    name: "nine_point all tie",
    gameType: "nine_point", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 4, B: 4, C: 4 },
  },

  // Bingo bango bongo
  {
    name: "bbb all different",
    gameType: "bingo_bango_bongo", players: ["A", "B", "C"], hole: 1, par: 3,
    strokes: { A: 3, B: 3, C: 3 },
    metadata: { bingo: "A", bango: "B", bongo: "C" },
  },

  // Best ball 4
  {
    name: "best_ball_4 team A wins",
    gameType: "best_ball_4", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 5, C: 3, D: 4 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Scramble
  {
    name: "scramble team A wins",
    gameType: "scramble", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 0, C: 5, D: 0 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Alternate shot 4
  {
    name: "alternate_shot_4",
    gameType: "alternate_shot_4", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 0, C: 5, D: 0 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Shamble
  {
    name: "shamble",
    gameType: "shamble", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 3, B: 0, C: 4, D: 0 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Nassau 4
  {
    name: "nassau_4 team A wins",
    gameType: "nassau_4", players: ["A", "B", "C", "D"], hole: 5, par: 4,
    strokes: { A: 4, B: 5, C: 4, D: 5 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Vegas
  {
    name: "vegas team A wins",
    gameType: "vegas", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 5, C: 3, D: 4 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Hammer
  {
    name: "hammer winner",
    gameType: "hammer", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4 },
    metadata: { hammerValue: 1 },
  },
  {
    name: "hammer doubled",
    gameType: "hammer", players: ["A", "B"], hole: 1, par: 4,
    strokes: { A: 3, B: 5 },
    metadata: { hammerValue: 2 },
  },

  // Stableford
  {
    name: "stableford mixed",
    gameType: "stableford", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 4, C: 5 },
  },
  {
    name: "stableford eagle",
    gameType: "stableford", players: ["A", "B"], hole: 1, par: 4,
    strokes: { A: 2, B: 4 },
  },

  // Dots / junk
  {
    name: "dots_junk base",
    gameType: "dots_junk", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 4, C: 5 },
    metadata: { dots: {} },
  },
  {
    name: "dots_junk with achievements",
    gameType: "dots_junk", players: ["A", "B", "C"], hole: 1, par: 4,
    strokes: { A: 3, B: 4, C: 5 },
    metadata: { dots: { A: ["birdie", "sandy"], B: ["greenie"] } },
  },

  // Banker
  {
    name: "banker beats all",
    gameType: "banker", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 3, B: 5, C: 4, D: 5 },
    options: { currentWolfIndex: 0 },
  },
  {
    name: "banker loses to one",
    gameType: "banker", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 5, B: 3, C: 4, D: 5 },
    options: { currentWolfIndex: 0 },
  },

  // Alternate shot 2
  {
    name: "alternate_shot 2p",
    gameType: "alternate_shot", players: ["Alice", "Bob"], hole: 1, par: 4,
    strokes: { Alice: 4, Bob: 4 },
  },

  // Skins 4
  {
    name: "skins_4 winner",
    gameType: "skins_4", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 3, B: 4, C: 5, D: 4 },
    options: { tieCarryover: true },
  },
  {
    name: "skins_4 carryover tie",
    gameType: "skins_4", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 4, C: 5, D: 3 },
    options: { tieCarryover: true },
  },

  // Team best ball (multi-team)
  {
    name: "team_best_ball team A wins",
    gameType: "team_best_ball", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 5, C: 3, D: 4 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },
  {
    name: "team_best_ball tie",
    gameType: "team_best_ball", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 5, C: 4, D: 5 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Team scramble (multi-team)
  {
    name: "team_scramble team A wins",
    gameType: "team_scramble", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 0, C: 5, D: 0 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },
  {
    name: "team_scramble tie",
    gameType: "team_scramble", players: ["A", "B", "C", "D"], hole: 1, par: 4,
    strokes: { A: 4, B: 0, C: 4, D: 0 },
    options: { teams: [["A", "B"], ["C", "D"]] },
  },

  // Handicap tests — ensure useHandicap gate matches between engines
  {
    name: "match_play with handicap on",
    gameType: "match_play", players: ["Alice", "Bob"], hole: 1, par: 4,
    strokes: { Alice: 5, Bob: 5 },
    options: { handicaps: { Alice: 0, Bob: 10 }, gameSettings: { useHandicap: true } },
  },
  {
    name: "nassau with handicap on (low hc player wins)",
    gameType: "nassau", players: ["Alice", "Bob"], hole: 5, par: 4,
    strokes: { Alice: 5, Bob: 5 },
    options: { handicaps: { Alice: 0, Bob: 10 }, gameSettings: { useHandicap: true } },
  },
  {
    name: "stableford with handicap on",
    gameType: "stableford", players: ["A", "B"], hole: 1, par: 4,
    strokes: { A: 5, B: 5 },
    options: { handicaps: { A: 0, B: 12 }, gameSettings: { useHandicap: true } },
  },
];

// ── Run real A/B comparison ──────────────────────────────────────────────────

let pass = 0;
let fail = 0;
const failures: string[] = [];

for (const tc of testCases) {
  const game = makeGame(tc.gameType, tc.players, tc.options);

  // Legacy engine (original switch statement)
  const legacy = calcHoleResultLegacy(game, tc.hole, tc.par, tc.strokes, tc.metadata || {});

  // New config engine
  const config = presetToConfig({ gameType: tc.gameType, playerNames: tc.players, teams: tc.options?.teams });
  if (!config) {
    failures.push(`[SKIP] ${tc.name}: no config for gameType "${tc.gameType}"`);
    continue;
  }

  const input: HoleScoreInput = {
    hole: tc.hole,
    par: tc.par,
    strokes: tc.strokes,
    metadata: tc.metadata || {},
  };
  const configResult = scoreHoleWithConfig(game, config, input);

  // Compare
  const deltasMatch = JSON.stringify(legacy.pointDeltas) === JSON.stringify(configResult.pointDeltas);
  const resultMatch = legacy.result === configResult.result;
  const metaMatch = JSON.stringify(legacy.metadata) === JSON.stringify(configResult.metadata);

  if (deltasMatch && resultMatch && metaMatch) {
    pass++;
  } else {
    fail++;
    const diffs: string[] = [];
    if (!deltasMatch) diffs.push(`deltas: legacy=${JSON.stringify(legacy.pointDeltas)} config=${JSON.stringify(configResult.pointDeltas)}`);
    if (!resultMatch) diffs.push(`result: legacy="${legacy.result}" config="${configResult.result}"`);
    if (!metaMatch) diffs.push(`metadata: legacy=${JSON.stringify(legacy.metadata)} config=${JSON.stringify(configResult.metadata)}`);
    failures.push(`[FAIL] ${tc.name} (${tc.gameType}): ${diffs.join(" | ")}`);
  }
}

console.log("\n========================================");
console.log("CONFIG SCORING VERIFICATION RESULTS");
console.log("Legacy switch vs Config engine (A/B)");
console.log("========================================");
console.log(`Passed: ${pass}/${pass + fail}`);
console.log(`Failed: ${fail}/${pass + fail}`);

if (failures.length > 0) {
  console.log("\n--- Failures / Skips ---");
  failures.forEach(f => console.log(f));
} else {
  console.log("\nAll test cases produce identical results.");
}
console.log("========================================\n");

process.exit(fail > 0 ? 1 : 0);
