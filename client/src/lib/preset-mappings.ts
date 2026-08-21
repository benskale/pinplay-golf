/**
 * Preset Mappings — converts existing GAME_DEFINITIONS to GameConfig objects.
 *
 * Each preset game type maps to a GameConfig with the same JSON shape.
 * This ensures backward compatibility: existing games continue to work
 * through the new config-driven engine.
 *
 * The mapping is designed to be lossless — every behavior in the original
 * switch statement is captured in the config.
 */

import type {
  GameConfig,
  ScoringRules,
  TeamStructure,
  BetPool,
  MiniGameConfig,
  PressRules,
} from "@shared/game-config";

// ── Helper: individual team structure ────────────────────────────────────────

function individual(): TeamStructure {
  return { type: "individual" };
}

function teams(playerIds: string[]): TeamStructure {
  return {
    type: "teams",
    assignmentMode: "preset",
    teams: [
      { id: "A", name: "Team A", playerIds: playerIds.slice(0, Math.ceil(playerIds.length / 2)) },
      { id: "B", name: "Team B", playerIds: playerIds.slice(Math.ceil(playerIds.length / 2)) },
    ],
  };
}

// ── Standard mini-game presets (empty by default, populated at setup) ────────

const emptyMiniGames: MiniGameConfig[] = [];
const emptyBetPools: BetPool[] = [];

// ── Default press rules (match play games) ───────────────────────────────────

const defaultPressRules: PressRules = {
  enabled: false,
  maxPerHole: 3,
  multiplier: [2, 4, 8],
  whoCanPress: "anyone",
  responseType: "accept_or_drop",
  crossGroup: false,
};

// ── Build a config from a preset game type ───────────────────────────────────

export interface PresetConfigParams {
  gameType: string;
  playerNames: string[];
  teams?: string[][]; // existing team structure
}

/**
 * Converts a preset game type into a GameConfig.
 * Returns null if the game type is not recognized.
 */
export function presetToConfig(params: PresetConfigParams): GameConfig | null {
  const { gameType, playerNames } = params;
  const playerCount = playerNames.length;
  const teamIds = playerNames;

  switch (gameType) {

    // ── 2-player games ──────────────────────────────────────────────

    case "match_play":
      return {
        id: "match_play",
        name: "Match Play",
        source: "preset",
        description: "Hole-by-hole win/loss. Each hole is worth 1 point. Lower net score wins.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "match_play",
          handicapBased: true,
          carryover: false,
          holeValue: 1,
          holeValueUnit: "points",
        },
        betPools: emptyBetPools,
        pressRules: { ...defaultPressRules, enabled: false },
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "stroke_play":
      return {
        id: "stroke_play",
        name: "Stroke Play",
        source: "preset",
        description: "Total strokes for the round. Lowest score wins.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "stroke_play",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "nassau":
      return {
        id: "nassau",
        name: "Nassau",
        source: "preset",
        description: "Three separate match-play bets: front 9, back 9, and total 18.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "match_play",
          handicapBased: true,
          carryover: false,
          segments: [
            { name: "Front 9", holes: [1, 9] },
            { name: "Back 9", holes: [10, 18] },
            { name: "Overall", holes: [1, 18] },
          ],
        },
        betPools: emptyBetPools,
        pressRules: { ...defaultPressRules, enabled: false },
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "skins":
    case "skins_3":
    case "skins_4":
      return {
        id: gameType,
        name: gameType === "skins" ? "Skins" : gameType === "skins_3" ? "3-Man Skins" : "Skins",
        source: "preset",
        description: "Lowest score wins the hole outright. Ties carry the skin to the next hole.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "skins",
          handicapBased: false,
          carryover: true,
          carryoverType: "skins",
        },
        betPools: [
          {
            id: "skins_main",
            name: "Skins",
            type: "skins",
            scope: "per_hole",
            participants: "all",
            value: 1,
            valueUnit: "per_hole",
          },
        ],
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: true,
      };

    case "alternate_shot":
      return {
        id: "alternate_shot",
        name: "Alternate Shot",
        source: "preset",
        description: "Partners alternate hitting the same ball. Enter one team score per hole.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "alternate_shot",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "best_ball_2":
      return {
        id: "best_ball_2",
        name: "Best Ball",
        source: "preset",
        description: "Each player plays their own ball. Lower net score from each player counts.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "match_play",
          handicapBased: true,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "par_birdie":
      return {
        id: "par_birdie",
        name: "Par/Birdie Points",
        source: "preset",
        description: "Par=1pt, Birdie=2pts, Eagle=4pts, Bogey=0. Most points wins.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "points",
          handicapBased: false,
          carryover: false,
          pointsTable: { eagle: 4, birdie: 2, par: 1, bogey: 0 },
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    // ── 3-player games ──────────────────────────────────────────────

    case "wolf_3":
      return {
        id: "wolf_3",
        name: "Wolf (3-player)",
        source: "preset",
        description: "Wolf rotates each hole. Wolf goes alone (+2) or picks partner (+1 each).",
        playerCount,
        teamStructure: {
          type: "teams",
          assignmentMode: "wolf_style",
          rotationRules: { method: "wolf_pick", wolfOrder: "last" },
        },
        scoring: {
          format: "wolf",
          handicapBased: false,
          carryover: false,
          holeValue: 1,
          holeValueUnit: "points",
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "sixes":
      return {
        id: "sixes",
        name: "Sixes / Round Robin",
        source: "preset",
        description: "18 holes split into 3 groups of 6. Partners rotate so everyone teams with everyone.",
        playerCount,
        teamStructure: {
          type: "teams",
          assignmentMode: "rotating",
          rotationRules: { method: "segments", segments: 3 },
        },
        scoring: {
          format: "sixes",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "split_sixes":
      return {
        id: "split_sixes",
        name: "Split Sixes",
        source: "preset",
        description: "6-hole best-ball match play segments. Partners rotate each 6 holes.",
        playerCount,
        teamStructure: {
          type: "teams",
          assignmentMode: "rotating",
          rotationRules: { method: "segments", segments: 3 },
        },
        scoring: {
          format: "sixes",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "nine_point":
      return {
        id: "nine_point",
        name: "9-Point",
        source: "preset",
        description: "9 points per hole split by finish: 1st=5pts, 2nd=3pts, 3rd=1pt. Ties split the combined points.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "nine_point",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "bingo_bango_bongo":
      return {
        id: "bingo_bango_bongo",
        name: "Bingo Bango Bongo",
        source: "preset",
        description: "3 pts per hole: first on green (Bingo), closest to pin (Bango), first to hole out (Bongo).",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "bingo_bango_bongo",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
        specialInputs: ["bingo", "bango", "bongo"],
      };

    // ── 4-player games ──────────────────────────────────────────────

    case "best_ball_4":
      return {
        id: "best_ball_4",
        name: "Best Ball (2v2)",
        source: "preset",
        description: "Two teams. Best score from each team counts per hole. Match play format.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "match_play",
          handicapBased: true,
          carryover: false,
          countingScores: [{ type: "net", count: 1, order: "low" }],
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "scramble":
      return {
        id: "scramble",
        name: "Scramble",
        source: "preset",
        description: "Best shot from each team counts. Two teams, enter one score each.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "scramble",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "alternate_shot_4":
      return {
        id: "alternate_shot_4",
        name: "Alternate Shot (Foursomes)",
        source: "preset",
        description: "Two teams of 2. Partners alternate hitting the same ball.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "alternate_shot",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "shamble":
      return {
        id: "shamble",
        name: "Shamble",
        source: "preset",
        description: "Best tee shot chosen for all. Each player then plays their own ball. Best ball counts.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "shamble",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "nassau_4":
      return {
        id: "nassau_4",
        name: "Nassau (2v2)",
        source: "preset",
        description: "Two teams compete in three bets: front 9, back 9, and 18 total (match play).",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "match_play",
          handicapBased: true,
          carryover: false,
          countingScores: [{ type: "net", count: 1, order: "low" }],
          segments: [
            { name: "Front 9", holes: [1, 9] },
            { name: "Back 9", holes: [10, 18] },
            { name: "Overall", holes: [1, 18] },
          ],
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "wolf_5":
      return {
        id: "wolf_5",
        name: "Wolf (5-Player)",
        source: "preset",
        description: "5-player Wolf. Pick a partner (2v3 best ball) or go Lone Wolf 1v4.",
        playerCount,
        teamStructure: {
          type: "teams",
          assignmentMode: "wolf_style",
          rotationRules: { method: "wolf_pick", wolfOrder: "last" },
        },
        scoring: {
          format: "wolf",
          handicapBased: false,
          carryover: false,
          holeValue: 1,
          holeValueUnit: "points",
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "wolf":
      return {
        id: "wolf",
        name: "Wolf",
        source: "preset",
        description: "Rotating Wolf picks a partner or goes alone. Best ball vs best ball.",
        playerCount,
        teamStructure: {
          type: "teams",
          assignmentMode: "wolf_style",
          rotationRules: { method: "wolf_pick", wolfOrder: "last" },
        },
        scoring: {
          format: "wolf",
          handicapBased: false,
          carryover: false,
          holeValue: 1,
          holeValueUnit: "points",
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "vegas":
      return {
        id: "vegas",
        name: "Vegas",
        source: "preset",
        description: "Two teams. Scores are combined as a 2-digit number. Lower number wins the difference in points.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "vegas",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "hammer":
      return {
        id: "hammer",
        name: "Hammer",
        source: "preset",
        description: "Any player can double the bet ('Hammer'). Lower score wins the current bet value.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "hammer",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
        specialInputs: ["hammer"],
      };

    case "stableford":
      return {
        id: "stableford",
        name: "Quota / Stableford",
        source: "preset",
        description: "Points per hole relative to par. Quota = 36 minus handicap.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "stableford",
          handicapBased: true,
          carryover: false,
          stablefordTable: { "-3": 6, "-2": 5, "-1": 4, "0": 3, "1": 2, "2": 1 },
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "dots_junk":
      return {
        id: "dots_junk",
        name: "Dots / Junk",
        source: "preset",
        description: "Base stroke play with bonus dots for birdies, eagles, sandies, greenies.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "dots_junk",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
        specialInputs: ["dots"],
      };

    case "banker":
      return {
        id: "banker",
        name: "Banker",
        source: "preset",
        description: "One rotating Banker plays three individual matches simultaneously.",
        playerCount,
        teamStructure: individual(),
        scoring: {
          format: "banker",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    case "team_best_ball":
      return {
        id: "team_best_ball",
        name: "Team Best Ball",
        source: "preset",
        description: "Multi-team best ball. Best net score per team counts.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "team_best_ball",
          handicapBased: true,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: true,
        carryover: false,
      };

    case "team_scramble":
      return {
        id: "team_scramble",
        name: "Team Scramble",
        source: "preset",
        description: "Multi-team scramble. Best shot from each team counts.",
        playerCount,
        teamStructure: teams(teamIds),
        scoring: {
          format: "team_scramble",
          handicapBased: false,
          carryover: false,
        },
        betPools: emptyBetPools,
        miniGames: emptyMiniGames,
        sideBets: [],
        needsHandicap: false,
        carryover: false,
      };

    default:
      return null;
  }
}

/**
 * Returns the list of preset game types that support a given player count.
 * Used for filtering the game-type dropdown in setup.
 */
export function getPresetsForPlayerCount(count: number): string[] {
  const allPresets = [
    "match_play", "stroke_play", "nassau", "skins", "alternate_shot", "best_ball_2", "par_birdie",
    "wolf_3", "sixes", "skins_3", "split_sixes", "nine_point", "bingo_bango_bongo",
    "best_ball_4", "scramble", "alternate_shot_4", "shamble", "nassau_4", "skins_4",
    "wolf", "vegas", "hammer", "stableford", "dots_junk", "banker",
    "team_best_ball", "team_scramble",
  ];

  return allPresets.filter(gt => {
    const config = presetToConfig({ gameType: gt, playerNames: Array.from({ length: count }, (_, i) => `P${i + 1}`) });
    return config !== null && config.playerCount === count;
  });
}
