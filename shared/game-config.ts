/**
 * GameConfig — the universal config shape for every PinPlay game.
 *
 * Every game (preset or custom) produces this same JSON structure.
 * The scoring engine reads this config to determine how holes are scored,
 * how bet pools are settled, and how pressing works.
 *
 * This is the single source of truth for game behavior once a round/tournament starts.
 * The config is FROZEN at game start — no modifications allowed during live scoring.
 */

// ── Core Config ──────────────────────────────────────────────────────────────

export interface GameConfig {
  /** Unique identifier — preset id (e.g. "wolf") or "custom_xxx" */
  id: string;
  /** Display name shown in UI */
  name: string;
  /** How this config was created */
  source: "preset" | "custom";
  /** Human-readable summary of the game rules */
  description?: string;

  /** Total number of players */
  playerCount: number;
  /** Team structure (individual or teams, rotation rules) */
  teamStructure: TeamStructure;

  /** Scoring rules — the heart of the system */
  scoring: ScoringRules;

  /** Money that flows through the game */
  betPools: BetPool[];

  /** Press rules (double-down mechanics) */
  pressRules?: PressRules;

  /** Auto-tracked mini-games (birdies, sandies, etc.) */
  miniGames: MiniGameConfig[];

  /** 1-on-1 personal wagers between specific players */
  sideBets: SideBetConfig[];

  /** Metadata */
  needsHandicap: boolean;
  carryover: boolean;
  /** Extra per-hole inputs needed beyond strokes (e.g. ["bingo", "bango", "bongo"]) */
  specialInputs?: string[];
}

// ── Team Structure ───────────────────────────────────────────────────────────

export interface TeamStructure {
  type: "individual" | "teams";

  /** For teams type */
  teams?: TeamDef[];
  assignmentMode?: "preset" | "rotating" | "wolf_style";
  // preset = teams set at start
  // rotating = partners rotate (e.g. Sixes splits into 3 segments)
  // wolf_style = one player picks partner each hole

  /** For rotating/wolf */
  rotationRules?: RotationRules;
}

export interface TeamDef {
  id: string; // "A", "B", "C"...
  name: string; // "Team Alpha"
  playerIds: string[];
}

export interface RotationRules {
  method: "segments" | "per_hole" | "wolf_pick";
  segments?: number; // for segments (e.g. 3 segments of 6 holes)
  wolfOrder?: "last" | "first"; // wolf rotation order
}

// ── Scoring Rules ────────────────────────────────────────────────────────────

export interface ScoringRules {
  /** How scores are compared */
  format: ScoringFormat;

  /**
   * What counts per hole (for team games).
   * e.g. "2 best gross + 1 best net" = [
   *   { type: "gross", count: 2, order: "low" },
   *   { type: "net",  count: 1, order: "low" }
   * ]
   */
  countingScores?: CountingScoreDef[];

  /** Custom point system per hole (e.g. { eagle: 4, birdie: 2, par: 1 }) */
  pointsTable?: Record<string, number>;

  /** Stableford point table keyed by relative-to-par string */
  stablefordTable?: Record<string, number>;

  /** Carryover behavior */
  carryover: boolean;
  /** How carries accumulate */
  carryoverType?: "skins" | "nassau";

  /** Handicap application */
  handicapBased: boolean;
  handicapMethod?: "full" | "match_play_diff" | "peoria" | "callaway";

  /** Per-hole value (if fixed) */
  holeValue?: number;
  holeValueUnit?: "points" | "dollars";

  /** Multi-segment scoring (Nassau-style) */
  segments?: ScoringSegment[];
}

export interface CountingScoreDef {
  type: "gross" | "net";
  count: number;
  order: "low" | "high";
}

export interface ScoringSegment {
  name: string; // "Front 9", "Back 9", "Overall"
  holes: [number, number]; // [1, 9], [10, 18], [1, 18]
  value?: number;
}

export type ScoringFormat =
  | "stroke_play"
  | "match_play"
  | "skins"
  | "points"
  | "stableford"
  | "quota"
  | "nine_point"
  | "bingo_bango_bongo"
  | "vegas"
  | "hammer"
  | "dots_junk"
  | "banker"
  | "wolf"
  | "sixes"
  | "alternate_shot"
  | "scramble"
  | "shamble"
  | "team_best_ball"
  | "team_scramble"
  | "custom";

// ── Bet Pools ────────────────────────────────────────────────────────────────

export interface BetPool {
  id: string;
  name: string;
  type: BetPoolType;
  scope: "per_hole" | "per_round" | "per_day" | "per_tournament";
  participants: "all" | "teams" | "individuals" | string[];
  value: number;
  valueUnit: "per_hole" | "per_round" | "per_point" | "flat";
  qualifier?: string; // e.g. "par 3s only", "birdies only"
}

export type BetPoolType =
  | "match"
  | "skins"
  | "pool"
  | "achievement"
  | "side_bet"
  | "custom";

// ── Press Rules ──────────────────────────────────────────────────────────────

export interface PressRules {
  enabled: boolean;
  maxPerHole: number;
  multiplier: number[]; // [2, 4, 8]
  whoCanPress: "anyone" | "losing_only";
  responseType: "accept_or_drop";
  crossGroup?: boolean;
}

// ── Mini-Games & Side Bets ───────────────────────────────────────────────────

export interface MiniGameConfig {
  id: string;
  enabled: boolean;
  value: number;
}

export interface SideBetConfig {
  id: string;
  playerA: string;
  playerB: string;
  description: string;
  scope: "hole" | "round" | "game";
  value: number;
}

// ── Tournament Config ────────────────────────────────────────────────────────

export interface TournamentConfig {
  id: string;
  name: string;
  totalDays: number;
  players: TournamentPlayer[];
  teams?: TeamDef[];
  days: TournamentDay[];
  tournamentPools: BetPool[];
  leaderboard: LeaderboardConfig;
}

export interface TournamentPlayer {
  id: string;
  name: string;
  handicapIndex?: number;
  ghinNumber?: string;
  teamId?: string;
}

export interface TournamentDay {
  dayNumber: number;
  date?: string;
  course?: CourseRef;
  gameConfig: GameConfig;
  status: "upcoming" | "in_progress" | "complete" | "rest_day";
}

export interface CourseRef {
  courseId: string;
  courseName: string;
}

export interface LeaderboardConfig {
  aggregation: "total_strokes" | "total_points" | "match_record" | "custom";
  countingMethod?: CountingScoreDef[];
  tiesResolvedBy?: "playoff" | "countback" | "split";
}

// ── GHIN Integration Scaffolding ─────────────────────────────────────────────

/**
 * GHIN handicap lookup interface.
 *
 * Implementation requires USGA Authorized Handicap Data Affiliate status.
 * The backend service stub is defined here so all code paths that need
 * handicap data can reference this interface. Manual entry remains the
 * fallback until GHIN API credentials are obtained.
 *
 * Steps to activate:
 * 1. Apply for USGA Authorized Handicap Data Affiliate program
 * 2. Obtain OAuth 2.0 client credentials from api.ghin.com
 * 3. Implement GhinService class (see server/ghin-service.ts stub)
 * 4. Add GHIN_CLIENT_ID and GHIN_CLIENT_SECRET to environment
 */

export interface GhinHandicapResult {
  ghinNumber: string;
  handicapIndex: number;
  revisionDate: string;
  trend: number[];
}

export interface GhinServiceInterface {
  /** Look up a player's current official handicap index by GHIN number */
  lookupHandicap(ghinNumber: string): Promise<GhinHandicapResult | null>;
  /** Get score history */
  getScores(ghinNumber: string): Promise<GhinScoreEntry[]>;
}

export interface GhinScoreEntry {
  date: string;
  score: number;
  courseName: string;
  courseRating: number;
  slopeRating: number;
  holes: 9 | 18;
  type: "home" | "away" | "tournament";
}

// ── Hole Scoring Input/Output ────────────────────────────────────────────────

export interface HoleScoreInput {
  hole: number;
  par: number;
  /** Player name → gross strokes */
  strokes: Record<string, number>;
  /** Extra metadata for special game types (wolf decision, bingo/bango/bongo, etc.) */
  metadata?: Record<string, any>;
}

export interface HoleScoreResult {
  /** Player name → point delta (added to totalScores) */
  pointDeltas: Record<string, number>;
  /** Human-readable result string for UI display */
  result: string;
  /** Machine-readable metadata (skinCarried, wolfPlayer, etc.) */
  metadata: Record<string, any>;
}
