/**
 * Config Validator — validates GameConfig objects before game start.
 *
 * Ensures all required fields are present, player counts are valid,
 * scoring rules are internally consistent, and bet pools make sense.
 * Returns a list of errors (empty = valid config).
 */

import type {
  GameConfig,
  ScoringRules,
  BetPool,
  TeamStructure,
} from "@shared/game-config";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateGameConfig(config: GameConfig): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Required fields ──────────────────────────────────────────────

  if (!config.id) errors.push("Config must have an id");
  if (!config.name) errors.push("Config must have a name");
  if (!config.source) errors.push("Config must have a source (preset or custom)");
  if (!config.playerCount || config.playerCount < 2) errors.push("playerCount must be at least 2");
  if (config.playerCount > 20) warnings.push("playerCount > 20 may affect performance");

  // ── Scoring rules ────────────────────────────────────────────────

  if (!config.scoring) {
    errors.push("Config must have scoring rules");
  } else {
    validateScoring(config.scoring, config.playerCount, errors, warnings);
  }

  // ── Team structure ───────────────────────────────────────────────

  if (config.teamStructure) {
    validateTeamStructure(config.teamStructure, config.playerCount, errors);
  }

  // ── Bet pools ────────────────────────────────────────────────────

  if (config.betPools) {
    config.betPools.forEach((pool, i) => {
      validateBetPool(pool, i, errors);
    });
  }

  // ── Handicap consistency ─────────────────────────────────────────

  if (config.scoring?.handicapBased && !config.needsHandicap) {
    warnings.push("scoring.handicapBased is true but needsHandicap is false");
  }

  // ── Mini-games ───────────────────────────────────────────────────

  if (config.miniGames) {
    config.miniGames.forEach(mg => {
      if (!mg.id) errors.push("Mini-game must have an id");
      if (mg.value < 0) errors.push(`Mini-game ${mg.id} has negative value`);
    });
  }

  // ── Side bets ────────────────────────────────────────────────────

  if (config.sideBets) {
    config.sideBets.forEach(sb => {
      if (!sb.id) errors.push("Side bet must have an id");
      if (!sb.playerA || !sb.playerB) errors.push(`Side bet ${sb.id || "(unnamed)"} must have playerA and playerB`);
      if (sb.value < 0) errors.push(`Side bet ${sb.id} has negative value`);
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateScoring(
  scoring: ScoringRules,
  playerCount: number,
  errors: string[],
  warnings: string[],
): void {
  if (!scoring.format) {
    errors.push("Scoring must have a format");
    return;
  }

  // Counting scores consistency
  if (scoring.countingScores) {
    const totalNeeded = scoring.countingScores.reduce((sum, cs) => sum + cs.count, 0);
    if (totalNeeded > playerCount) {
      errors.push(`countingScores requires ${totalNeeded} scores but only ${playerCount} players available`);
    }
  }

  // Points table consistency
  if (scoring.format === "points" && !scoring.pointsTable) {
    errors.push("Points format requires a pointsTable");
  }

  // Stableford table consistency
  if (scoring.format === "stableford" && !scoring.stablefordTable) {
    errors.push("Stableford format requires a stablefordTable");
  }

  // Carryover consistency
  if (scoring.carryover && !scoring.carryoverType) {
    warnings.push("carryover is true but carryoverType not specified (defaulting to skins)");
  }

  // Segments consistency
  if (scoring.segments) {
    scoring.segments.forEach(seg => {
      if (seg.holes[0] < 1 || seg.holes[1] > 18 || seg.holes[0] > seg.holes[1]) {
        errors.push(`Segment "${seg.name}" has invalid hole range [${seg.holes[0]}, ${seg.holes[1]}]`);
      }
    });
  }
}

function validateTeamStructure(
  teamStructure: TeamStructure,
  playerCount: number,
  errors: string[],
): void {
  if (teamStructure.type === "teams" && teamStructure.teams) {
    const totalPlayers = teamStructure.teams.reduce((sum, t) => sum + t.playerIds.length, 0);
    if (totalPlayers !== playerCount) {
      errors.push(`Teams have ${totalPlayers} players but playerCount is ${playerCount}`);
    }
  }

  if (teamStructure.type === "teams" && teamStructure.assignmentMode === "wolf_style") {
    if (playerCount < 3) {
      errors.push("Wolf-style team assignment requires at least 3 players");
    }
  }

  if (teamStructure.type === "teams" && teamStructure.assignmentMode === "rotating") {
    if (!teamStructure.rotationRules) {
      errors.push("Rotating team assignment requires rotationRules");
    }
  }
}

function validateBetPool(pool: BetPool, index: number, errors: string[]): void {
  if (!pool.id) errors.push(`Bet pool at index ${index} must have an id`);
  if (!pool.name) errors.push(`Bet pool at index ${index} must have a name`);
  if (!pool.type) errors.push(`Bet pool ${pool.id || index} must have a type`);
  if (!pool.scope) errors.push(`Bet pool ${pool.id || index} must have a scope`);
  if (pool.value < 0) errors.push(`Bet pool ${pool.id || index} has negative value`);
}
