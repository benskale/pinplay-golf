import type { Game } from "@shared/schema";

// ─── Game Definitions ─────────────────────────────────────────────────────────

export interface GameDef {
  id: string;
  name: string;
  description: string;
  playerCounts: number[];
  isTeamGame: boolean; // requires team assignment in setup
  needsHandicap: boolean;
  carryover: boolean; // skins-style carryover option
  specialInputs?: string[]; // extra per-hole inputs needed beyond strokes
}

export const GAME_DEFINITIONS: Record<string, GameDef> = {
  // ── 2-player ──────────────────────────────────────────────────────
  match_play: {
    id: "match_play", name: "Match Play", playerCounts: [2],
    description: "Hole-by-hole win/loss. Each hole is worth 1 point. Lower net score wins.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  stroke_play: {
    id: "stroke_play", name: "Stroke Play", playerCounts: [2, 3, 4],
    description: "Total strokes for the round. Lowest score wins.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  nassau: {
    id: "nassau", name: "Nassau", playerCounts: [2],
    description: "Three separate match-play bets: front 9, back 9, and total 18.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  skins: {
    id: "skins", name: "Skins", playerCounts: [2, 3, 4],
    description: "Lowest score wins the hole outright. Ties carry the skin to the next hole.",
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
    isTeamGame: false, needsHandicap: false, carryover: false,
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
    id: "best_ball_4", name: "Best Ball (2v2)", playerCounts: [4],
    description: "Two teams of two. Best score from each team counts per hole. Match play format.",
    isTeamGame: true, needsHandicap: true, carryover: false,
  },
  scramble: {
    id: "scramble", name: "Scramble", playerCounts: [4],
    description: "All hit, choose best shot, everyone plays from there. Two teams, enter one score each.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  alternate_shot_4: {
    id: "alternate_shot_4", name: "Alternate Shot (Foursomes)", playerCounts: [4],
    description: "Two teams of 2. Partners alternate hitting the same ball. Stroke play or match play.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  shamble: {
    id: "shamble", name: "Shamble", playerCounts: [4],
    description: "Best tee shot chosen for all. Each player then plays their own ball. Best ball counts.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  nassau_4: {
    id: "nassau_4", name: "Nassau (2v2)", playerCounts: [4],
    description: "Two teams of 2 compete in three bets: front 9, back 9, and 18 total (match play).",
    isTeamGame: true, needsHandicap: true, carryover: false,
  },
  skins_4: {
    id: "skins_4", name: "Skins", playerCounts: [4],
    description: "Lowest individual score wins the skin. Ties carry to the next hole.",
    isTeamGame: false, needsHandicap: false, carryover: true,
  },
  wolf: {
    id: "wolf", name: "Wolf", playerCounts: [4],
    description: "Rotating Wolf picks a partner or goes alone. Best ball vs best ball.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
  vegas: {
    id: "vegas", name: "Vegas", playerCounts: [4],
    description: "Two teams. Scores are combined as a 2-digit number (e.g. 4&5=45). Lower number wins the difference in points.",
    isTeamGame: true, needsHandicap: false, carryover: false,
  },
  hammer: {
    id: "hammer", name: "Hammer", playerCounts: [4],
    description: "Any player can double the bet ('Hammer'). Lower score wins the current bet value.",
    isTeamGame: false, needsHandicap: false, carryover: false,
    specialInputs: ["hammer"],
  },
  stableford: {
    id: "stableford", name: "Quota / Stableford", playerCounts: [4],
    description: "Points per hole: Eagle=5, Birdie=4, Par=3, Bogey=2, Dbl Bogey=1, Worse=0. Quota = 36 minus handicap.",
    isTeamGame: false, needsHandicap: true, carryover: false,
  },
  dots_junk: {
    id: "dots_junk", name: "Dots / Junk", playerCounts: [4],
    description: "Base stroke play with bonus dots for birdies (+1), eagles (+2), sandies (+1), greenies (+1 on par 3s).",
    isTeamGame: false, needsHandicap: false, carryover: false,
    specialInputs: ["dots"],
  },
  banker: {
    id: "banker", name: "Banker", playerCounts: [4],
    description: "One rotating Banker plays three individual matches simultaneously. Win/loss against the Banker.",
    isTeamGame: false, needsHandicap: false, carryover: false,
  },
};

export function getGamesForPlayerCount(count: number): GameDef[] {
  return Object.values(GAME_DEFINITIONS).filter(g => g.playerCounts.includes(count));
}

export function isLowerBetter(gameType: string): boolean {
  return ["stroke_play", "alternate_shot", "alternate_shot_4", "scramble", "shamble"].includes(gameType);
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
  strokes: Record<string, number>,
  extraMeta: Record<string, any> = {},
): HoleResult {
  const { players, handicaps, teams, gameType, holeHistory, tieCarryover } = game;
  const si = getStrokeIndexes(game);
  const deltas: Record<string, number> = {};
  players.forEach(p => { deltas[p] = 0; });

  switch (gameType) {

    // ── WOLF (4-player) ──────────────────────────────────────────────
    case "wolf": {
      const wolfPlayer = extraMeta.wolfPlayer as string;
      const wolfDecision = extraMeta.wolfDecision as string; // "alone" | partner name
      if (!wolfPlayer || !wolfDecision) break;

      const wolfStr = strokes[wolfPlayer];
      const nonWolves = players.filter(p => p !== wolfPlayer);

      if (wolfDecision === "alone") {
        const bestOther = Math.min(...nonWolves.map(p => strokes[p]));
        if (wolfStr < bestOther) {
          deltas[wolfPlayer] = 3;
        } else if (wolfStr > bestOther) {
          nonWolves.forEach(p => { deltas[p] = 1; });
        }
      } else {
        const partner = wolfDecision;
        const wolfTeam = [wolfPlayer, partner];
        const otherTeam = players.filter(p => !wolfTeam.includes(p));
        const wolfBest = Math.min(...wolfTeam.map(p => strokes[p]));
        const otherBest = Math.min(...otherTeam.map(p => strokes[p]));
        if (wolfBest < otherBest) {
          wolfTeam.forEach(p => { deltas[p] = 1; });
        } else if (wolfBest > otherBest) {
          otherTeam.forEach(p => { deltas[p] = 1; });
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
      if (totalPts === 0) result = wolfDecision === "alone" ? "Wolf alone · Tie" : `Wolf + ${wolfDecision} · Tie`;
      else if (wolfDecision === "alone") result = wolfPts === 3 ? "Wolf alone · Wolf wins (+3)" : "Wolf alone · Team wins (+1 each)";
      else result = wolfPts > 0 ? `Wolf + ${wolfDecision} · Wolf's team wins (+1)` : `Wolf + ${wolfDecision} · Opponents win (+1)`;

      return { pointDeltas: deltas, result, metadata: { wolfPlayer, wolfDecision } };
    }

    // ── WOLF (3-player) ──────────────────────────────────────────────
    case "wolf_3": {
      const wolfPlayer = extraMeta.wolfPlayer as string;
      const wolfDecision = extraMeta.wolfDecision as string;
      if (!wolfPlayer || !wolfDecision) break;

      const wolfStr = strokes[wolfPlayer];
      const nonWolves = players.filter(p => p !== wolfPlayer);

      if (wolfDecision === "alone") {
        const bestOther = Math.min(...nonWolves.map(p => strokes[p]));
        if (wolfStr < bestOther) {
          deltas[wolfPlayer] = 2; // Wolf alone beats both
        } else {
          nonWolves.forEach(p => { deltas[p] = 1; }); // Wolf alone loses
        }
      } else {
        const partner = wolfDecision;
        const lonePlayer = nonWolves.find(p => p !== partner)!;
        const wolfTeamBest = Math.min(strokes[wolfPlayer], strokes[partner]);
        const loneStr = strokes[lonePlayer];
        if (wolfTeamBest < loneStr) {
          deltas[wolfPlayer] = 1;
          deltas[partner] = 1;
        } else if (wolfTeamBest > loneStr) {
          deltas[lonePlayer] = 2;
        }
      }

      const wolfPts = deltas[wolfPlayer];
      const totalPts = Object.values(deltas).reduce((s, p) => s + p, 0);
      let result3 = "";
      if (totalPts === 0) result3 = "Tie — no points";
      else if (wolfDecision === "alone") result3 = wolfPts > 0 ? "Wolf alone wins (+2)" : "Team wins (+1 each)";
      else result3 = wolfPts > 0 ? `Wolf + ${wolfDecision} win (+1 each)` : `${nonWolves.find(p => p !== wolfDecision)} wins (+2)`;

      return { pointDeltas: deltas, result: result3, metadata: { wolfPlayer, wolfDecision } };
    }

    // ── MATCH PLAY (2-player) ─────────────────────────────────────────
    case "match_play":
    case "best_ball_2": {
      const [p1, p2] = players;
      const net1 = netStrokes(strokes[p1], p1, hole, handicaps, players, si);
      const net2 = netStrokes(strokes[p2], p2, hole, handicaps, players, si);
      // Show gross(net) format when strokes were given
      const fmt = (p: string, net: number) => {
        const g = strokes[p];
        return g !== net ? `${g}(${net})` : `${g}`;
      };
      let result = "";
      if (net1 < net2) {
        deltas[p1] = 1;
        result = `${p1.split(" ")[0]} wins hole · ${fmt(p1, net1)} vs ${fmt(p2, net2)} net`;
      } else if (net2 < net1) {
        deltas[p2] = 1;
        result = `${p2.split(" ")[0]} wins hole · ${fmt(p2, net2)} vs ${fmt(p1, net1)} net`;
      } else {
        result = `Halved · ${fmt(p1, net1)} net each`;
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
      const net1 = netStrokes(strokes[p1], p1, hole, handicaps, players, si);
      const net2 = netStrokes(strokes[p2], p2, hole, handicaps, players, si);
      // Score per hole (we'll sum to determine front/back winner at hole 9 and 18)
      // For running total, use match-play style (holes won)
      let result = "";
      if (net1 < net2) {
        deltas[p1] = 1;
        result = `${p1.split(" ")[0]} wins hole`;
      } else if (net2 < net1) {
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
      const netA = (p: string) => netStrokes(strokes[p] || 99, p, hole, handicaps, players, si);
      const bestA = Math.min(...teamA.map(netA));
      const bestB = Math.min(...teamB.map(p => netStrokes(strokes[p] || 99, p, hole, handicaps, players, si)));
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
        deltas[winners[0]] = betMultiplier * 3; // wins from all 3 others
        loser.forEach(p => { deltas[p] = -betMultiplier; });
        result = `${winners[0].split(" ")[0]} wins! ${betMultiplier > 1 ? `(×${betMultiplier} Hammer)` : ""}`;
      } else {
        result = `Tie — no winner`;
      }
      return { pointDeltas: deltas, result, metadata: { hammerValue: betMultiplier } };
    }

    // ── STABLEFORD / QUOTA ───────────────────────────────────────────
    case "stableford": {
      // Uses correct per-hole handicap strokes (same as match play).
      // Each player's net score = gross − strokes received on this hole.
      // Points: net eagle(−2)=5, birdie(−1)=4, par=3, bogey=2, dbl bogey=1, worse=0.
      players.forEach(p => {
        const strk = strokesOnHole(p, hole, handicaps, players, si);
        const net = (strokes[p] || par) - strk;
        const diff = net - par;
        const pts = diff <= -3 ? 6 : diff === -2 ? 5 : diff === -1 ? 4 : diff === 0 ? 3 : diff === 1 ? 2 : diff === 2 ? 1 : 0;
        deltas[p] = pts;
      });
      const parts = players.map(p => {
        const strk = strokesOnHole(p, hole, handicaps, players, si);
        const net = (strokes[p] || par) - strk;
        return `${p.split(" ")[0]}: ${deltas[p]}pt${strk > 0 ? ` (${strokes[p]}→${net})` : ""}`;
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
