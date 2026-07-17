/**
 * Config-Driven Scoring Engine
 *
 * Scores holes based on a GameConfig instead of a hardcoded switch statement.
 * Every existing game type's logic is replicated here, driven by config fields.
 *
 * DESIGN PRINCIPLE: This engine produces IDENTICAL results to the existing
 * calcHoleResult() switch statement in game-logic.ts for all preset game types.
 * The switch statement stays as the live code path until full migration;
 * this engine runs in parallel and is verified to match.
 *
 * Migration plan:
 * Phase 1 (this file): Engine built, runs in parallel, verified to match
 * Phase 2: game-logic.ts routes through this engine; switch statement removed
 */

import type { GameConfig, HoleScoreInput, HoleScoreResult } from "@shared/game-config";
import type { Game } from "@shared/schema";

// ── Handicap helpers (mirrors game-logic.ts) ─────────────────────────────────

function configStrokesOnHole(
  playerName: string,
  hole: number,
  handicaps: Record<string, number>,
  players: string[],
  strokeIndexes: number[],
): number {
  const hdcp = handicaps[playerName] || 0;
  const lowestHdcp = Math.min(...players.map(p => handicaps[p] || 0));
  const diff = Math.max(0, hdcp - lowestHdcp);
  if (diff === 0) return 0;

  const rank = strokeIndexes[hole - 1] ?? hole;
  const fullRounds = Math.floor(diff / 18);
  const remainder = diff % 18;
  const extra = remainder > 0 && rank <= remainder ? 1 : 0;
  return fullRounds + extra;
}

function configGetStrokeIndexes(game: Game): number[] {
  return Array.isArray(game.strokeIndexes) && game.strokeIndexes.length === 18
    ? game.strokeIndexes
    : Array.from({ length: 18 }, (_, i) => i + 1);
}

function configSkinCarryCount(holeHistory: Game["holeHistory"]): number {
  let count = 0;
  for (let i = holeHistory.length - 1; i >= 0; i--) {
    if (holeHistory[i].metadata?.skinCarried) count++;
    else break;
  }
  return count;
}

// ── Main scoring entry point ─────────────────────────────────────────────────

/**
 * Score a hole using a GameConfig.
 *
 * @param game The current game state (for players, handicaps, teams, history)
 * @param config The frozen game config
 * @param input Hole score data (strokes, metadata)
 * @returns HoleScoreResult with point deltas, result string, and metadata
 */
export function scoreHoleWithConfig(
  game: Game,
  config: GameConfig,
  input: HoleScoreInput,
): HoleScoreResult {
  const { players, handicaps, teams, holeHistory, tieCarryover } = game;
  const settings = (game as any).gameSettings || {};
  const si = configGetStrokeIndexes(game);
  const { hole, par, strokes: inputStrokes } = input;
  const extraMeta: Record<string, any> = input.metadata || {};

  const deltas: Record<string, number> = {};
  players.forEach(p => { deltas[p] = 0; });

  const useHandicap = settings.useHandicap === true || config.scoring.handicapBased;
  const strokes: Record<string, number> = {};
  players.forEach(p => {
    const gross = inputStrokes[p] || 0;
    strokes[p] = useHandicap
      ? gross - configStrokesOnHole(p, hole, handicaps, players, si)
      : gross;
  });

  const format = config.scoring.format;

  // ── Dispatch by scoring format ───────────────────────────────────

  switch (format) {

    case "wolf": {
      return scoreWolf(game, players, strokes, deltas, extraMeta, settings, config);
    }

    case "match_play": {
      // Nassau uses simpler result strings (no stroke comparison)
      if (config.id === "nassau") {
        return scoreNassau(players, strokes, deltas);
      }
      // Check if this is a team game (best_ball_4, nassau_4) or individual (match_play, best_ball_2)
      if (config.teamStructure.type === "teams" && teams.length >= 2) {
        return scoreTeamMatchPlay(players, strokes, deltas, teams, inputStrokes);
      }
      return scoreIndividualMatchPlay(players, strokes, deltas, inputStrokes);
    }

    case "stroke_play": {
      return scoreStrokePlay(players, strokes, deltas, par);
    }

    case "skins": {
      return scoreSkins(players, strokes, deltas, tieCarryover, holeHistory);
    }

    case "alternate_shot": {
      // 2-player (alternate_shot) or 4-player (alternate_shot_4)
      if (config.teamStructure.type === "teams" && teams.length >= 2) {
        return scoreTeamStrokeScramble(players, strokes, deltas, teams, par);
      }
      return scoreAlternateShot2(players, strokes, deltas, par);
    }

    case "scramble":
    case "shamble": {
      return scoreTeamStrokeScramble(players, strokes, deltas, teams, par);
    }

    case "points": {
      return scorePoints(players, strokes, deltas, par, config);
    }

    case "sixes": {
      return scoreSixes(players, strokes, deltas, hole);
    }

    case "nine_point": {
      return scoreNinePoint(players, strokes, deltas);
    }

    case "bingo_bango_bongo": {
      return scoreBingoBangoBongo(players, deltas, extraMeta);
    }

    case "vegas": {
      return scoreVegas(players, strokes, deltas, teams);
    }

    case "hammer": {
      return scoreHammer(players, strokes, deltas, extraMeta);
    }

    case "stableford": {
      return scoreStableford(players, strokes, deltas, par, inputStrokes, config);
    }

    case "dots_junk": {
      return scoreDotsJunk(players, strokes, deltas, extraMeta);
    }

    case "banker": {
      return scoreBanker(game, players, strokes, deltas);
    }

    default:
      return { pointDeltas: deltas, result: "Hole complete", metadata: {} };
  }
}

// ── Individual scorers ───────────────────────────────────────────────────────

function scoreWolf(
  game: Game,
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  extraMeta: Record<string, any>,
  settings: Record<string, any>,
  config: GameConfig,
): HoleScoreResult {
  const wolfPlayer = extraMeta.wolfPlayer as string;
  const wolfDecision = extraMeta.wolfDecision as string;
  if (!wolfPlayer || !wolfDecision) {
    return { pointDeltas: deltas, result: "Hole complete", metadata: {} };
  }

  const is3Player = players.length === 3;
  const wolfStr = strokes[wolfPlayer];
  const nonWolves = players.filter(p => p !== wolfPlayer);
  const isSolo = wolfDecision === "alone" || wolfDecision === "blind";

  if (isSolo) {
    const bestOther = Math.min(...nonWolves.map(p => strokes[p]));
    const baseWinPts = settings.wolfWinAlone ?? (is3Player ? 2 : 3);
    const baseLosePts = settings.wolfWinTeam ?? 1;
    const winPts = wolfDecision === "blind" ? baseWinPts * 2 : baseWinPts;
    const losePts = wolfDecision === "blind" ? baseLosePts * 2 : baseLosePts;

    if (wolfStr < bestOther) {
      deltas[wolfPlayer] = winPts;
    } else if (wolfStr > bestOther) {
      nonWolves.forEach(p => { deltas[p] = losePts; });
    }
  } else {
    // Partner picked
    const partner = wolfDecision;
    if (is3Player) {
      // 3-player: wolf + partner vs lone player
      const wolfTeamBest = Math.min(strokes[wolfPlayer], strokes[partner]);
      const lonePlayer = nonWolves.find(p => p !== partner)!;
      const loneStr = strokes[lonePlayer];
      const teamWinPts = settings.wolfWinTeam ?? 1;
      const loneWinPts = settings.wolfWinAlone ?? 2;

      if (wolfTeamBest < loneStr) {
        deltas[wolfPlayer] = teamWinPts;
        deltas[partner] = teamWinPts;
      } else if (wolfTeamBest > loneStr) {
        deltas[lonePlayer] = loneWinPts;
      }
    } else {
      // 4-player: wolf + partner vs other two (best ball each side)
      const wolfTeam = [wolfPlayer, partner];
      const otherTeam = players.filter(p => !wolfTeam.includes(p));
      const wolfBest = Math.min(...wolfTeam.map(p => strokes[p]));
      const otherBest = Math.min(...otherTeam.map(p => strokes[p]));
      const teamWinPts = settings.wolfWinTeam ?? 1;

      if (wolfBest < otherBest) {
        wolfTeam.forEach(p => { deltas[p] = teamWinPts; });
      } else if (wolfBest > otherBest) {
        otherTeam.forEach(p => { deltas[p] = teamWinPts; });
      } else {
        // Tiebreaker: 2nd best from each team
        const wolfSecond = wolfTeam.find(p => strokes[p] !== wolfBest) ?? wolfTeam[0];
        const otherSecond = otherTeam.find(p => strokes[p] !== otherBest) ?? otherTeam[0];
        if (strokes[wolfSecond] < strokes[otherSecond]) {
          wolfTeam.forEach(p => { deltas[p] = 1; });
        } else if (strokes[otherSecond] < strokes[wolfSecond]) {
          otherTeam.forEach(p => { deltas[p] = 1; });
        }
      }
    }
  }

  // Build result string (format differs between 3-player and 4-player)
  const wolfPts = deltas[wolfPlayer];
  const totalPts = Object.values(deltas).reduce((s, p) => s + p, 0);
  let result = "";

  if (is3Player) {
    // 3-player wolf result format (matches original game-logic.ts)
    if (totalPts === 0) {
      result = "Tie \u2014 no points";
    } else if (isSolo) {
      const multiplier3 = wolfDecision === "blind" ? 2 : 1;
      const basePts3 = (settings.wolfWinAlone ?? 2) * multiplier3;
      result = wolfPts > 0
        ? `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone wins (+${basePts3})`
        : `Team wins (+${(settings.wolfWinTeam ?? 1) * multiplier3} each)`;
    } else {
      result = wolfPts > 0
        ? `Wolf + ${wolfDecision} win (+1 each)`
        : `${nonWolves.find(p => p !== wolfDecision)} wins (+2)`;
    }
  } else {
    // 4-player wolf result format
    if (totalPts === 0) {
      result = isSolo
        ? `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone \u00b7 Tie`
        : `Wolf + ${wolfDecision} \u00b7 Tie`;
    } else if (isSolo) {
      const multiplier = wolfDecision === "blind" ? 2 : 1;
      const basePts = (settings.wolfWinAlone ?? 3) * multiplier;
      const teamPts = (settings.wolfWinTeam ?? 1) * multiplier;
      result = wolfPts > 0
        ? `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone \u00b7 Wolf wins (+${basePts})`
        : `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone \u00b7 Team wins (+${teamPts} each)`;
    } else {
      result = wolfPts > 0
        ? `Wolf + ${wolfDecision} \u00b7 Wolf's team wins (+1)`
        : `Wolf + ${wolfDecision} \u00b7 Opponents win (+1)`;
    }
  }

  return { pointDeltas: deltas, result, metadata: { wolfPlayer, wolfDecision } };
}

function scoreNassau(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
): HoleScoreResult {
  const [p1, p2] = players;
  let result = "";
  if (strokes[p1] < strokes[p2]) {
    deltas[p1] = 1;
    result = `${p1.split(" ")[0]} wins hole`;
  } else if (strokes[p2] < strokes[p1]) {
    deltas[p2] = 1;
    result = `${p2.split(" ")[0]} wins hole`;
  } else {
    result = "Halved";
  }
  return { pointDeltas: deltas, result, metadata: {} };
}

function scoreIndividualMatchPlay(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  inputStrokes: Record<string, number>,
): HoleScoreResult {
  const [p1, p2] = players;
  const fmt = (p: string) => {
    const g = inputStrokes[p];
    const n = strokes[p];
    return g !== undefined && g !== n ? `${g}(${n})` : `${n}`;
  };
  let result = "";
  if (strokes[p1] < strokes[p2]) {
    deltas[p1] = 1;
    result = `${p1.split(" ")[0]} wins hole · ${fmt(p1)} vs ${fmt(p2)}`;
  } else if (strokes[p2] < strokes[p1]) {
    deltas[p2] = 1;
    result = `${p2.split(" ")[0]} wins hole · ${fmt(p2)} vs ${fmt(p1)}`;
  } else {
    result = `Halved · ${fmt(p1)} each`;
  }
  return { pointDeltas: deltas, result, metadata: {} };
}

function scoreTeamMatchPlay(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  teams: string[][],
  inputStrokes: Record<string, number>,
): HoleScoreResult {
  const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
  const bestA = Math.min(...teamA.map(p => strokes[p] || 99));
  const bestB = Math.min(...teamB.map(p => strokes[p] || 99));
  let result = "";
  if (bestA < bestB) {
    teamA.forEach(p => { deltas[p] = 1; });
    result = `Team ${teamA.map(p => p.split(" ")[0]).join("+")} wins hole`;
  } else if (bestB < bestA) {
    teamB.forEach(p => { deltas[p] = 1; });
    result = `Team ${teamB.map(p => p.split(" ")[0]).join("+")} wins hole`;
  } else {
    result = "Halved";
  }
  return { pointDeltas: deltas, result, metadata: {} };
}

function scoreStrokePlay(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  par: number,
): HoleScoreResult {
  players.forEach(p => { deltas[p] = strokes[p] || 0; });
  const best = Math.min(...players.map(p => strokes[p] || 99));
  const bestPlayers = players.filter(p => strokes[p] === best);
  const result = bestPlayers.map(p => p.split(" ")[0]).join(" & ") +
    (best < par ? ` lowest (${par - best} under)` : best === par ? " lowest (par)" : ` lowest (+${best - par})`);
  return { pointDeltas: deltas, result, metadata: {} };
}

function scoreSkins(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  tieCarryover: boolean,
  holeHistory: Game["holeHistory"],
): HoleScoreResult {
  const carry = tieCarryover ? configSkinCarryCount(holeHistory) + 1 : 1;
  const minStroke = Math.min(...players.map(p => strokes[p]));
  const winners = players.filter(p => strokes[p] === minStroke);
  let result = "";
  let skinMeta: Record<string, any> = {};
  if (winners.length === 1) {
    deltas[winners[0]] = carry;
    result = `${winners[0].split(" ")[0]} wins ${carry} skin${carry > 1 ? "s" : ""}!`;
    skinMeta = { skinCarried: false };
  } else {
    result = `Tie — skin${carry > 1 ? "s carry" : " carries"} (${carry + 1} on next hole)`;
    skinMeta = { skinCarried: true };
  }
  return { pointDeltas: deltas, result, metadata: skinMeta };
}

function scoreAlternateShot2(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  par: number,
): HoleScoreResult {
  const [p1, p2] = players;
  deltas[p1] = strokes[p1] || 0;
  deltas[p2] = strokes[p2] || 0;
  const result = `${p1.split(" ")[0]}: ${strokes[p1] || "\u2013"}  |  ${p2.split(" ")[0]}: ${strokes[p2] || "\u2013"}`;
  return { pointDeltas: deltas, result, metadata: {} };
}

function scoreTeamStrokeScramble(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  teams: string[][],
  par: number,
): HoleScoreResult {
  const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
  const scoreA = strokes[teamA[0]] || 0;
  const scoreB = strokes[teamB[0]] || 0;
  teamA.forEach(p => { deltas[p] = scoreA; });
  teamB.forEach(p => { deltas[p] = scoreB; });
  const fmt = (d: number) => d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`;
  const result = `${teamA.map(p => p.split(" ")[0]).join("+")} ${scoreA}(${fmt(scoreA - par)})  vs  ${teamB.map(p => p.split(" ")[0]).join("+")} ${scoreB}(${fmt(scoreB - par)})`;
  return { pointDeltas: deltas, result, metadata: {} };
}

function scorePoints(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  par: number,
  config: GameConfig,
): HoleScoreResult {
  const table = config.scoring.pointsTable || { eagle: 4, birdie: 2, par: 1, bogey: 0 };
  const scorePoints = (gross: number): number => {
    const diff = gross - par;
    if (diff <= -2) return table.eagle ?? 4;
    if (diff === -1) return table.birdie ?? 2;
    if (diff === 0) return table.par ?? 1;
    return table.bogey ?? 0;
  };
  players.forEach(p => {
    deltas[p] = scorePoints(strokes[p] || par);
  });
  const parts = players.map(p => `${p.split(" ")[0]}: ${deltas[p]}pt`);
  return { pointDeltas: deltas, result: parts.join("  \u00b7  "), metadata: {} };
}

function scoreSixes(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  hole: number,
): HoleScoreResult {
  const seg = hole <= 6 ? 0 : hole <= 12 ? 1 : 2;
  const teamPairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  const [t0, t1] = teamPairs[seg];
  const loneSeg = [2, 1, 0][seg];
  const team = [players[t0], players[t1]];
  const lone = players[loneSeg];
  const teamBest = Math.min(strokes[team[0]], strokes[team[1]]);
  const loneStr = strokes[lone];
  let result = "";
  if (teamBest < loneStr) {
    team.forEach(p => { deltas[p] = 1; });
    result = `${team.map(p => p.split(" ")[0]).join("+")} win hole (+1 each)`;
  } else if (loneStr < teamBest) {
    deltas[lone] = 2;
    result = `${lone.split(" ")[0]} wins hole (+2)`;
  } else {
    result = "Halved";
  }
  return { pointDeltas: deltas, result, metadata: { segment: seg + 1 } };
}

function scoreNinePoint(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
): HoleScoreResult {
  const sorted = [...players].sort((a, b) => (strokes[a] || 99) - (strokes[b] || 99));
  const basePoints = [5, 3, 1];
  const scored = sorted.map((p, i) => ({
    name: p,
    strokes: strokes[p] || 99,
    basePoints: basePoints[i],
  }));

  const groups: { players: string[]; totalPoints: number }[] = [];
  let i = 0;
  while (i < scored.length) {
    const groupPlayers = [scored[i].name];
    let j = i + 1;
    while (j < scored.length && scored[j].strokes === scored[i].strokes) {
      groupPlayers.push(scored[j].name);
      j++;
    }
    const totalPts = scored.slice(i, j).reduce((s, x) => s + x.basePoints, 0);
    groups.push({ players: groupPlayers, totalPoints: totalPts });
    i = j;
  }

  groups.forEach(g => {
    const share = g.totalPoints / g.players.length;
    g.players.forEach(p => { deltas[p] = Math.round(share * 10) / 10; });
  });

  const parts = players.map(p => {
    const pts = deltas[p];
    return `${p.split(" ")[0]}: ${pts % 1 === 0 ? pts.toFixed(0) : pts}pt`;
  });
  return { pointDeltas: deltas, result: parts.join("  \u00b7  "), metadata: {} };
}

function scoreBingoBangoBongo(
  players: string[],
  deltas: Record<string, number>,
  extraMeta: Record<string, any>,
): HoleScoreResult {
  const bingo = extraMeta.bingo as string | undefined;
  const bango = extraMeta.bango as string | undefined;
  const bongo = extraMeta.bongo as string | undefined;
  if (bingo) deltas[bingo] = (deltas[bingo] || 0) + 1;
  if (bango) deltas[bango] = (deltas[bango] || 0) + 1;
  if (bongo) deltas[bongo] = (deltas[bongo] || 0) + 1;
  const parts: string[] = [];
  if (bingo) parts.push(`Bingo: ${bingo.split(" ")[0]}`);
  if (bango) parts.push(`Bango: ${bango.split(" ")[0]}`);
  if (bongo) parts.push(`Bongo: ${bongo.split(" ")[0]}`);
  return { pointDeltas: deltas, result: parts.join("  \u00b7  ") || "No points", metadata: { bingo, bango, bongo } };
}

function scoreVegas(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  teams: string[][],
): HoleScoreResult {
  const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
  const scoresA = teamA.map(p => strokes[p] || 99).sort((a, b) => a - b);
  const scoresB = teamB.map(p => strokes[p] || 99).sort((a, b) => a - b);
  const numA = scoresA[0] * 10 + scoresA[1];
  const numB = scoresB[0] * 10 + scoresB[1];
  const diff = Math.abs(numA - numB);
  let result = "";
  if (numA < numB) {
    teamA.forEach(p => { deltas[p] = diff; });
    result = `Team ${teamA.map(p => p.split(" ")[0]).join("+")} wins (${numA} vs ${numB}, +${diff} pts)`;
  } else if (numB < numA) {
    teamB.forEach(p => { deltas[p] = diff; });
    result = `Team ${teamB.map(p => p.split(" ")[0]).join("+")} wins (${numB} vs ${numA}, +${diff} pts)`;
  } else {
    result = `Tie (${numA} each)`;
  }
  return { pointDeltas: deltas, result, metadata: { numA, numB } };
}

function scoreHammer(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  extraMeta: Record<string, any>,
): HoleScoreResult {
  const betMultiplier = (extraMeta.hammerValue as number) || 1;
  const minStr = Math.min(...players.map(p => strokes[p] || 99));
  const winners = players.filter(p => strokes[p] === minStr);
  let result = "";
  if (winners.length === 1) {
    const loser = players.filter(p => p !== winners[0]);
    deltas[winners[0]] = betMultiplier * loser.length;
    loser.forEach(p => { deltas[p] = -betMultiplier; });
    result = `${winners[0].split(" ")[0]} wins! ${betMultiplier > 1 ? `(\u00d7${betMultiplier} Hammer)` : ""}`;
  } else {
    result = `Tie \u2014 no winner`;
  }
  return { pointDeltas: deltas, result, metadata: { hammerValue: betMultiplier } };
}

function scoreStableford(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  par: number,
  inputStrokes: Record<string, number>,
  config: GameConfig,
): HoleScoreResult {
  const table = config.scoring.stablefordTable || { "-3": 6, "-2": 5, "-1": 4, "0": 3, "1": 2, "2": 1 };
  players.forEach(p => {
    const net = strokes[p] || par;
    const diff = net - par;
    const key = String(diff);
    deltas[p] = table[key] ?? 0;
  });
  const parts = players.map(p => {
    const g = inputStrokes[p];
    const n = strokes[p];
    return `${p.split(" ")[0]}: ${deltas[p]}pt${g !== undefined && g !== n ? ` (${g}\u2192${n})` : ""}`;
  });
  return { pointDeltas: deltas, result: parts.join("  \u00b7  "), metadata: {} };
}

function scoreDotsJunk(
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
  extraMeta: Record<string, any>,
): HoleScoreResult {
  const minStr = Math.min(...players.map(p => strokes[p] || 99));
  const baseWinners = players.filter(p => strokes[p] === minStr);
  if (baseWinners.length === 1) {
    deltas[baseWinners[0]] = (deltas[baseWinners[0]] || 0) + 1;
  }
  const dotAchievements = (extraMeta.dots as Record<string, string[]>) || {};
  const dotValues: Record<string, number> = { birdie: 1, eagle: 2, sandy: 1, greenie: 1, snake: -1 };
  players.forEach(p => {
    const achievements = dotAchievements[p] || [];
    achievements.forEach((a: string) => { deltas[p] = (deltas[p] || 0) + (dotValues[a] || 0); });
  });
  const parts = players.map(p => `${p.split(" ")[0]}: ${deltas[p] > 0 ? "+" : ""}${deltas[p]}`);
  return { pointDeltas: deltas, result: parts.join("  \u00b7  "), metadata: { dots: dotAchievements } };
}

function scoreBanker(
  game: Game,
  players: string[],
  strokes: Record<string, number>,
  deltas: Record<string, number>,
): HoleScoreResult {
  const bankerIdx = game.currentWolfIndex;
  const banker = players[bankerIdx];
  const bankerStr = strokes[banker] || 99;
  const others = players.filter(p => p !== banker);
  const outcomes: string[] = [];
  others.forEach(p => {
    const pStr = strokes[p] || 99;
    if (pStr < bankerStr) {
      deltas[p] = 1;
      deltas[banker] = (deltas[banker] || 0) - 1;
      outcomes.push(`${p.split(" ")[0]} beats banker`);
    } else if (bankerStr < pStr) {
      deltas[banker] = (deltas[banker] || 0) + 1;
      deltas[p] = -1;
      outcomes.push(`Banker beats ${p.split(" ")[0]}`);
    } else {
      outcomes.push(`${p.split(" ")[0]} ties banker`);
    }
  });
  return { pointDeltas: deltas, result: `Banker: ${banker.split(" ")[0]}  \u00b7  ${outcomes.join(", ")}`, metadata: { banker } };
}
