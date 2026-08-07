/**
 * Legacy Scoring Engine — the original switch-based calcHoleResult.
 *
 * Extracted from the pre-migration game-logic.ts (git HEAD).
 * Used ONLY by the verification script to compare against the new
 * config-driven engine. Do NOT use in production code.
 */
import type { Game } from "@shared/schema";

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

export function calcHoleResultLegacy(
  game: Game,
  hole: number,
  par: number,
  inputStrokes: Record<string, number>,
  extraMeta: Record<string, any> = {},
): HoleResult {
  const { players, handicaps, teams, gameType, holeHistory, tieCarryover } = game;
  const settings = (game as any).gameSettings || {};
  const si = getStrokeIndexes(game);
  const deltas: Record<string, number> = {};
  players.forEach(p => { deltas[p] = 0; });

  // When handicap play is enabled, compute net strokes for ALL comparisons.
  // Shadow `strokes` so every game type below uses net automatically.
  const useHandicap = settings.useHandicap === true;
  const strokes: Record<string, number> = {};
  players.forEach(p => {
    const gross = inputStrokes[p] || 0;
    strokes[p] = useHandicap
      ? netStrokes(gross, p, hole, handicaps, players, si)
      : gross;
  });

  switch (gameType) {

    // ── WOLF (4-player) ──────────────────────────────────────────────
    case "wolf": {
      const wolfPlayer = extraMeta.wolfPlayer as string;
      const wolfDecision = extraMeta.wolfDecision as string; // "alone" | "blind" | partner name
      if (!wolfPlayer || !wolfDecision) break;

      const wolfStr = strokes[wolfPlayer];
      const nonWolves = players.filter(p => p !== wolfPlayer);
      const isSolo = wolfDecision === "alone" || wolfDecision === "blind";

      if (isSolo) {
        const bestOther = Math.min(...nonWolves.map(p => strokes[p]));
        const baseWinPts = settings.wolfWinAlone ?? 3;
        const baseLosePts = settings.wolfWinTeam ?? 1;
        // Blind Wolf = 2x stakes
        const winPts = wolfDecision === "blind" ? baseWinPts * 2 : baseWinPts;
        const losePts = wolfDecision === "blind" ? baseLosePts * 2 : baseLosePts;
        if (wolfStr < bestOther) {
          deltas[wolfPlayer] = winPts;
        } else if (wolfStr > bestOther) {
          nonWolves.forEach(p => { deltas[p] = losePts; });
        }
      } else {
        const partner = wolfDecision;
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
          // Best balls tied — use 2nd player from each team as tiebreaker
          const wolfSecond = wolfTeam.find(p => strokes[p] !== wolfBest) ?? wolfTeam[0];
          const otherSecond = otherTeam.find(p => strokes[p] !== otherBest) ?? otherTeam[0];
          const wolfSecondStr = strokes[wolfSecond];
          const otherSecondStr = strokes[otherSecond];
          if (wolfSecondStr < otherSecondStr) {
            wolfTeam.forEach(p => { deltas[p] = 1; });
          } else if (otherSecondStr < wolfSecondStr) {
            otherTeam.forEach(p => { deltas[p] = 1; });
          }
          // else: both players on each team tied — hole is halved, no points
        }
      }

      const wolfPts = deltas[wolfPlayer];
      const totalPts = Object.values(deltas).reduce((s, p) => s + p, 0);
      let result = "";
      if (totalPts === 0) result = isSolo ? `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone · Tie` : `Wolf + ${wolfDecision} · Tie`;
      else if (isSolo) {
        const multiplier = wolfDecision === "blind" ? 2 : 1;
        const basePts = (settings.wolfWinAlone ?? 3) * multiplier;
        result = wolfPts === basePts
          ? `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone · Wolf wins (+${basePts})`
          : `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone · Team wins (+${(settings.wolfWinTeam ?? 1) * multiplier} each)`;
      } else result = wolfPts > 0 ? `Wolf + ${wolfDecision} · Wolf's team wins (+1)` : `Wolf + ${wolfDecision} · Opponents win (+1)`;

      return { pointDeltas: deltas, result, metadata: { wolfPlayer, wolfDecision } };
    }

    // ── WOLF (3-player) ──────────────────────────────────────────────
    case "wolf_3": {
      const wolfPlayer = extraMeta.wolfPlayer as string;
      const wolfDecision = extraMeta.wolfDecision as string;
      if (!wolfPlayer || !wolfDecision) break;

      const wolfStr = strokes[wolfPlayer];
      const nonWolves = players.filter(p => p !== wolfPlayer);
      const isSolo3 = wolfDecision === "alone" || wolfDecision === "blind";

      if (isSolo3) {
        const bestOther = Math.min(...nonWolves.map(p => strokes[p]));
        const baseWinPts = settings.wolfWinAlone ?? 2;
        const baseLosePts = settings.wolfWinTeam ?? 1;
        // Blind Wolf = 2x stakes
        const winPts = wolfDecision === "blind" ? baseWinPts * 2 : baseWinPts;
        const losePts = wolfDecision === "blind" ? baseLosePts * 2 : baseLosePts;
        if (wolfStr < bestOther) {
          deltas[wolfPlayer] = winPts;
        } else {
          nonWolves.forEach(p => { deltas[p] = losePts; });
        }
      } else {
        const partner = wolfDecision;
        const lonePlayer = nonWolves.find(p => p !== partner)!;
        const wolfTeamBest = Math.min(strokes[wolfPlayer], strokes[partner]);
        const loneStr = strokes[lonePlayer];
        const teamWinPts = settings.wolfWinTeam ?? 1;
        const loneWinPts = settings.wolfWinAlone ?? 2;
        if (wolfTeamBest < loneStr) {
          deltas[wolfPlayer] = teamWinPts;
          deltas[partner] = teamWinPts;
        } else if (wolfTeamBest > loneStr) {
          deltas[lonePlayer] = loneWinPts;
        }
      }

      const wolfPts = deltas[wolfPlayer];
      const totalPts = Object.values(deltas).reduce((s, p) => s + p, 0);
      let result3 = "";
      if (totalPts === 0) result3 = "Tie — no points";
      else if (isSolo3) {
        const multiplier3 = wolfDecision === "blind" ? 2 : 1;
        const basePts3 = (settings.wolfWinAlone ?? 2) * multiplier3;
        result3 = wolfPts > 0 ? `Wolf ${wolfDecision === "blind" ? "BLIND " : ""}alone wins (+${basePts3})` : `Team wins (+${(settings.wolfWinTeam ?? 1) * multiplier3} each)`;
      } else result3 = wolfPts > 0 ? `Wolf + ${wolfDecision} win (+1 each)` : `${nonWolves.find(p => p !== wolfDecision)} wins (+2)`;

      return { pointDeltas: deltas, result: result3, metadata: { wolfPlayer, wolfDecision } };
    }

    // ── MATCH PLAY (2-player) ─────────────────────────────────────────
    case "match_play":
    case "best_ball_2": {
      const [p1, p2] = players;
      // strokes[] already contains net when useHandicap is on
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

    // ── STROKE PLAY (2-4 players) ─────────────────────────────────────
    case "stroke_play": {
      players.forEach(p => { deltas[p] = strokes[p] || 0; });
      const best = Math.min(...players.map(p => strokes[p] || 99));
      const bestPlayers = players.filter(p => strokes[p] === best);
      const result = bestPlayers.map(p => p.split(" ")[0]).join(" & ") +
        (best < par ? ` lowest (${par - best} under)` : best === par ? " lowest (par)" : ` lowest (+${best - par})`);
      return { pointDeltas: deltas, result, metadata: {} };
    }

    // ── NASSAU (2-player) ────────────────────────────────────────────
    case "nassau": {
      const [p1, p2] = players;
      // strokes[] already contains net when useHandicap is on
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

    // ── SKINS (all variants) ─────────────────────────────────────────
    case "skins":
    case "skins_3":
    case "skins_4": {
      const carry = tieCarryover ? skinCarryCount(holeHistory) + 1 : 1;
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

    // ── ALTERNATE SHOT (2-player: one score per player = team score) ──
    case "alternate_shot": {
      const [p1, p2] = players;
      deltas[p1] = strokes[p1] || 0;
      deltas[p2] = strokes[p2] || 0;
      const diff1 = (strokes[p1] || 0) - par;
      const result = `${p1.split(" ")[0]}: ${strokes[p1] || "–"}  |  ${p2.split(" ")[0]}: ${strokes[p2] || "–"}`;
      return { pointDeltas: deltas, result, metadata: {} };
    }

    // ── PAR/BIRDIE POINTS (2-player) ─────────────────────────────────
    case "par_birdie": {
      const scorePoints = (gross: number): number => {
        const diff = gross - par;
        if (diff <= -2) return 4; // Eagle
        if (diff === -1) return 2; // Birdie
        if (diff === 0) return 1;  // Par
        return 0;                   // Bogey+
      };
      players.forEach(p => {
        deltas[p] = scorePoints(strokes[p] || par);
      });
      const parts = players.map(p => `${p.split(" ")[0]}: ${deltas[p]}pt`);
      return { pointDeltas: deltas, result: parts.join("  ·  "), metadata: {} };
    }

    // ── SIXES (3-player) ─────────────────────────────────────────────
    case "sixes":
    case "split_sixes": {
      // Segment 1 (1-6): players[0]+players[1] vs players[2]
      // Segment 2 (7-12): players[0]+players[2] vs players[1]
      // Segment 3 (13-18): players[1]+players[2] vs players[0]
      const seg = hole <= 6 ? 0 : hole <= 12 ? 1 : 2;
      const teamPairs: [number, number][] = [[0,1],[0,2],[1,2]];
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

    // ── 9-POINT (3-player) ────────────────────────────────────────────
    case "nine_point": {
      // 9 points per hole: 1st=5, 2nd=3, 3rd=1. Ties split combined points.
      const sorted = [...players].sort((a, b) => (strokes[a] || 99) - (strokes[b] || 99));
      const scored: { name: string; strokes: number; basePoints: number }[] = [];
      // Assign base point values by position
      const basePoints = [5, 3, 1];
      sorted.forEach((p, i) => {
        scored.push({ name: p, strokes: strokes[p] || 99, basePoints: basePoints[i] });
      });

      // Handle ties: group players with same score, split their combined points
      const groups: { players: string[]; totalPoints: number }[] = [];
      let i = 0;
      while (i < scored.length) {
        const groupPlayers = [scored[i].name];
        const groupPoints = scored[i].basePoints;
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
      const result = parts.join("  ·  ");
      return { pointDeltas: deltas, result, metadata: {} };
    }

    // ── BINGO BANGO BONGO (3-player) ─────────────────────────────────
    case "bingo_bango_bongo": {
      const bingo = extraMeta.bingo as string | undefined;
      const bango = extraMeta.bango as string | undefined;
      const bongo = extraMeta.bongo as string | undefined;
      if (bingo) deltas[bingo] = (deltas[bingo] || 0) + 1;
      if (bango) deltas[bango] = (deltas[bango] || 0) + 1;
      if (bongo) deltas[bongo] = (deltas[bongo] || 0) + 1;
      const parts = [];
      if (bingo) parts.push(`Bingo: ${bingo.split(" ")[0]}`);
      if (bango) parts.push(`Bango: ${bango.split(" ")[0]}`);
      if (bongo) parts.push(`Bongo: ${bongo.split(" ")[0]}`);
      return { pointDeltas: deltas, result: parts.join("  ·  ") || "No points", metadata: { bingo, bango, bongo } };
    }

    // ── BEST BALL 4 (2v2 match play) ──────────────────────────────────
    case "best_ball_4":
    case "nassau_4": {
      const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
      // strokes[] already contains net when useHandicap is on
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

    // ── SCRAMBLE / ALTERNATE SHOT 4 / SHAMBLE (2v2 strokes) ──────────
    case "scramble":
    case "alternate_shot_4":
    case "shamble": {
      const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
      // For these games, one score per team — store it under first player on each team
      const scoreA = strokes[teamA[0]] || 0;
      const scoreB = strokes[teamB[0]] || 0;
      teamA.forEach(p => { deltas[p] = scoreA; });
      teamB.forEach(p => { deltas[p] = scoreB; });
      const diffA = scoreA - par;
      const diffB = scoreB - par;
      const fmt = (d: number) => d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`;
      const result = `${teamA.map(p => p.split(" ")[0]).join("+")} ${scoreA}(${fmt(diffA)})  vs  ${teamB.map(p => p.split(" ")[0]).join("+")} ${scoreB}(${fmt(diffB)})`;
      return { pointDeltas: deltas, result, metadata: {} };
    }

    // ── MULTI-TEAM BEST BALL (3-8 teams, 6+ players) ─────────────────
    case "team_best_ball": {
      const teamList = teams.length >= 2 ? teams : [players.slice(0, Math.ceil(players.length / 2)), players.slice(Math.ceil(players.length / 2))];
      const teamBests = teamList.map(team => ({
        team,
        best: Math.min(...team.map(p => strokes[p] || 99)),
      }));
      const sorted = [...teamBests].sort((a, b) => a.best - b.best);
      const winningBest = sorted[0].best;
      const tied = sorted.filter(t => t.best === winningBest);
      const fmt = (d: number) => d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`;
      if (tied.length > 1) {
        const parts = teamBests.map(t => `${t.team.map(p => p.split(" ")[0]).join("+")} ${t.best}(${fmt(t.best - par)})`);
        return { pointDeltas: deltas, result: `Tied at ${winningBest} — ${parts.join("  ·  ")}`, metadata: {} };
      }
      const winner = sorted[0];
      winner.team.forEach(p => { deltas[p] = 1; });
      const parts = teamBests.map(t => `${t.team.map(p => p.split(" ")[0]).join("+")} ${t.best}(${fmt(t.best - par)})`);
      return { pointDeltas: deltas, result: `${winner.team.map(p => p.split(" ")[0]).join("+")} wins — ${parts.join("  ·  ")}`, metadata: {} };
    }

    // ── MULTI-TEAM SCRAMBLE (3-8 teams, 6+ players) ──────────────────
    case "team_scramble": {
      const teamList = teams.length >= 2 ? teams : [players.slice(0, Math.ceil(players.length / 2)), players.slice(Math.ceil(players.length / 2))];
      const teamScores = teamList.map(team => ({
        team,
        score: strokes[team[0]] || 0,
      }));
      const sorted = [...teamScores].sort((a, b) => a.score - b.score);
      const winningScore = sorted[0].score;
      const tied = sorted.filter(t => t.score === winningScore);
      const fmt = (d: number) => d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`;
      teamList.forEach(team => {
        const teamScore = strokes[team[0]] || 0;
        team.forEach(p => { deltas[p] = teamScore; });
      });
      if (tied.length > 1) {
        const parts = teamScores.map(t => `${t.team.map(p => p.split(" ")[0]).join("+")} ${t.score}(${fmt(t.score - par)})`);
        return { pointDeltas: deltas, result: `Tied at ${winningScore} — ${parts.join("  ·  ")}`, metadata: {} };
      }
      const winner = sorted[0];
      const parts = teamScores.map(t => `${t.team.map(p => p.split(" ")[0]).join("+")} ${t.score}(${fmt(t.score - par)})`);
      return { pointDeltas: deltas, result: `${winner.team.map(p => p.split(" ")[0]).join("+")} wins — ${parts.join("  ·  ")}`, metadata: {} };
    }

    // ── VEGAS (2v2) ──────────────────────────────────────────────────
    case "vegas": {
      const [teamA, teamB] = teams.length === 2 ? teams : [[players[0], players[1]], [players[2], players[3]]];
      const scoresA = teamA.map(p => strokes[p] || 99).sort((a, b) => a - b);
      const scoresB = teamB.map(p => strokes[p] || 99).sort((a, b) => a - b);
      // Combine: lower number first (if team has birdie, flip to put lower last = bigger number)
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

    // ── HAMMER ───────────────────────────────────────────────────────
    case "hammer": {
      const betMultiplier = extraMeta.hammerValue as number || 1;
      const minStr = Math.min(...players.map(p => strokes[p] || 99));
      const winners = players.filter(p => strokes[p] === minStr);
      let result = "";
      if (winners.length === 1) {
        const loser = players.filter(p => p !== winners[0]);
        deltas[winners[0]] = betMultiplier * loser.length; // wins from all others
        loser.forEach(p => { deltas[p] = -betMultiplier; });
        result = `${winners[0].split(" ")[0]} wins! ${betMultiplier > 1 ? `(×${betMultiplier} Hammer)` : ""}`;
      } else {
        result = `Tie — no winner`;
      }
      return { pointDeltas: deltas, result, metadata: { hammerValue: betMultiplier } };
    }

    // ── STABLEFORD / QUOTA ───────────────────────────────────────────
    case "stableford": {
      // strokes[] already contains net when useHandicap is on.
      // Points: net eagle(−2)=5, birdie(−1)=4, par=3, bogey=2, dbl bogey=1, worse=0.
      players.forEach(p => {
        const net = strokes[p] || par;
        const diff = net - par;
        const pts = diff <= -3 ? 6 : diff === -2 ? 5 : diff === -1 ? 4 : diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0;
        deltas[p] = pts;
      });
      const parts = players.map(p => {
        const g = inputStrokes[p];
        const n = strokes[p];
        return `${p.split(" ")[0]}: ${deltas[p]}pt${g !== undefined && g !== n ? ` (${g}→${n})` : ""}`;
      });
      return { pointDeltas: deltas, result: parts.join("  ·  "), metadata: {} };
    }

    // ── DOTS / JUNK ──────────────────────────────────────────────────
    case "dots_junk": {
      // Base: 1 dot for lowest score (like skins lite, no carry)
      const minStr = Math.min(...players.map(p => strokes[p] || 99));
      const baseWinners = players.filter(p => strokes[p] === minStr);
      if (baseWinners.length === 1) {
        deltas[baseWinners[0]] = (deltas[baseWinners[0]] || 0) + 1;
      }
      // Extra dots from extraMeta.dots: Record<playerName, string[]> achievements
      const dotAchievements = extraMeta.dots as Record<string, string[]> || {};
      const dotValues: Record<string, number> = { birdie: 1, eagle: 2, sandy: 1, greenie: 1, snake: -1 };
      players.forEach(p => {
        const achievements = dotAchievements[p] || [];
        achievements.forEach((a: string) => { deltas[p] = (deltas[p] || 0) + (dotValues[a] || 0); });
      });
      const parts = players.map(p => `${p.split(" ")[0]}: ${deltas[p] > 0 ? "+" : ""}${deltas[p]}`);
      return { pointDeltas: deltas, result: parts.join("  ·  "), metadata: { dots: dotAchievements } };
    }

    // ── BANKER ───────────────────────────────────────────────────────
    case "banker": {
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
      return { pointDeltas: deltas, result: `Banker: ${banker.split(" ")[0]}  ·  ${outcomes.join(", ")}`, metadata: { banker } };
    }

    default:
      break;
  }

  return { pointDeltas: deltas, result: "Hole complete", metadata: {} };
}

/**
 * Returns how many handicap strokes each player receives on a given hole.
 * Re-uses the same strokesOnHole() rule used for actual scoring.
 */
