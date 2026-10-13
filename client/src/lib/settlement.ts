import type { Game } from "@shared/schema";

export interface SettlementTransaction {
  from: string;
  to: string;
  amount: number;
}

export interface LiveSettlement {
  netBalances: Record<string, number>;      // combined: main game + mini-games
  mainGameBalances: Record<string, number>; // main game points × pointValue only
  miniGameBalances: Record<string, number>; // side games only
  miniGameTotals: Record<string, Record<string, number>>; // per-game counts
  transactions: SettlementTransaction[];
  pointValue: number;
  hasMainGame: boolean;
  hasMiniGames: boolean;
}

/**
 * Compute running totals per mini-game from hole history.
 * Returns { [gameId]: { [player]: count } }
 */
/**
 * Nassau main-game settlement with correct press accounting.
 * Returns per-bet line items (front / back / overall / presses) and player balances.
 */
export function getNassauSettlement(game: Game, pointValue: number): {
  lineItems: Array<{ label: string; winner: string | null; amount: number; players: [string, string] }>;
  balances: Record<string, number>;
} {
  const presses = ((game.gameSettings as any)?.pressBets as any[]) ?? [];
  const [pA, pB] = game.players;
  const hist = game.holeHistory;
  const holeWinnerByHole: Record<number, "A" | "B" | null> = {};
  hist.forEach(h => {
    const winners = Object.entries(h.points || {}).filter(([, v]) => (v as number) > 0).map(([k]) => k);
    holeWinnerByHole[h.hole] = winners.length === 1 ? (winners[0] === pA ? "A" : "B") : null;
  });
  const segState = (lo: number, hi: number, from = 1) => {
    let diff = 0, played = 0;
    for (let h = Math.max(lo, from); h <= hi; h++) {
      const w = holeWinnerByHole[h];
      if (w === undefined) continue;
      played++;
      if (w === "A") diff++; else if (w === "B") diff--;
    }
    const finished = hi - Math.max(lo, from) + 1 - played <= 0;
    return { diff, finished };
  };
  const lineItems: Array<{ label: string; winner: string | null; amount: number; players: [string, string] }> = [];
  const addLine = (label: string, diff: number, finished: boolean, amount: number) => {
    const winner = !finished || diff === 0 ? null : diff > 0 ? pA : pB;
    lineItems.push({ label, winner, amount, players: [pA, pB] });
  };
  const front = segState(1, 9);
  addLine("Front 9", front.diff, front.finished, pointValue);
  const back = segState(10, 18);
  addLine("Back 9", back.diff, back.finished, pointValue);
  const overall = segState(1, 18);
  addLine("Overall 18", overall.diff, overall.finished, pointValue);
  presses.forEach((p, i) => {
    const [lo, hi] = p.segment === "front" ? [1, 9] : [10, 18];
    const st = segState(p.segment === "front" ? 1 : 10, hi, p.startHole);
    addLine(`Press #${i + 1} (${p.calledBy?.split(" ")[0] || p.side}, from ${p.startHole})`, st.diff, st.finished, p.amount || pointValue);
  });
  const balances: Record<string, number> = {};
  game.players.forEach(p => { balances[p] = 0; });
  lineItems.forEach(li => {
    if (li.winner) {
      const loser = li.winner === pA ? pB : pA;
      balances[li.winner] += li.amount;
      balances[loser] -= li.amount;
    }
  });
  return { lineItems, balances };
}


export function computeMiniGameTotals(game: Game): Record<string, Record<string, number>> {
  const activeMiniGames =
    game.miniGames && typeof game.miniGames === "object"
      ? Object.entries(game.miniGames).filter(([, v]) => v.enabled).map(([id]) => id)
      : [];

  if (activeMiniGames.length === 0) return {};

  const mgTotals: Record<string, Record<string, number>> = {};

  activeMiniGames.forEach((id) => {
    mgTotals[id] = {};
    game.players.forEach((p) => { mgTotals[id][p] = 0; });
  });

  game.holeHistory.forEach((h) => {
    const mg = h.metadata?.miniGames || {};
    activeMiniGames.forEach((id) => {
      if (id === "sandies" || id === "polies" || id === "chippies") {
        (mg[id] || []).forEach((p: string) => { if (mgTotals[id][p] !== undefined) mgTotals[id][p]++; });
      }
      if (id === "longest_drive" && mg[id]) {
        if (mgTotals[id][mg[id]] !== undefined) mgTotals[id][mg[id]]++;
      }
      if (id === "closest_to_pin" && mg[id] && mg[id] !== "none") {
        if (mgTotals[id][mg[id]] !== undefined) mgTotals[id][mg[id]]++;
      }
      if (id === "snake") {
        (mg[id] || []).forEach((p: string) => { if (mgTotals[id][p] !== undefined) mgTotals[id][p]++; });
      }
      if (id === "birdie_pool") {
        const holePar = game.pars?.[h.hole - 1] ?? 4;
        game.players.forEach((p) => {
          const str = h.strokes?.[p];
          if (str && str <= holePar - 1) mgTotals[id][p]++;
        });
      }
      if (id === "trash") {
        (mg[id] || []).forEach((entry: string) => {
          const [player] = entry.split(":");
          if (mgTotals[id][player] !== undefined) mgTotals[id][player]++;
        });
      }
      if (id === "rabbit") {
        const points = h.points || {};
        const winners = game.players.filter((p) => (points[p] || 0) > 0);
        if (winners.length === 1) mgTotals[id][winners[0]]++;
      }
    });
  });

  return mgTotals;
}

/**
 * Compute net dollar balances from all active mini-games.
 *
 * Payout models:
 *  - "each" (sandies, polies, chippies, trash, longest_drive, closest_to_pin, rabbit):
 *    each achievement earns $value from every other player
 *    net[P] = value * (count[P] * n - totalCount)   [zero-sum]
 *
 *  - snake: inverted — each "snake" costs $value paid TO every other player
 *    net[P] = -value * (count[P] * n - totalCount)
 *
 *  - birdie_pool: pot-based — everyone buys in $value, most birdies wins pot (split if tied)
 *    winner net = pot/winners - buy-in, non-winner net = -buy-in
 */
export function computeMiniGameBalances(game: Game): Record<string, number> {
  const totals = computeMiniGameTotals(game);
  const mgConfig = game.miniGames || {};
  const n = game.players.length;
  const balances: Record<string, number> = {};
  game.players.forEach((p) => { balances[p] = 0; });

  for (const [id, playerCounts] of Object.entries(totals)) {
    const value = mgConfig[id]?.value || 0;
    if (value === 0) continue;

    const totalCount = Object.values(playerCounts).reduce((s, v) => s + v, 0);
    if (totalCount === 0) continue;

    if (id === "birdie_pool") {
      const maxCount = Math.max(...Object.values(playerCounts));
      if (maxCount === 0) continue;
      const winners = game.players.filter((p) => playerCounts[p] === maxCount);
      const pot = value * n;
      const share = pot / winners.length;
      game.players.forEach((p) => {
        balances[p] += playerCounts[p] === maxCount ? share - value : -value;
      });
    } else if (id === "snake") {
      // Inverted: holder pays each other player
      game.players.forEach((p) => {
        const count = playerCounts[p] || 0;
        balances[p] -= value * (count * n - totalCount);
      });
    } else {
      // Standard per-opponent payout
      game.players.forEach((p) => {
        const count = playerCounts[p] || 0;
        balances[p] += value * (count * n - totalCount);
      });
    }
  }

  return balances;
}

/**
 * Calculate pairwise debts that minimize the number of transactions.
 * Greedy algorithm: match the largest debtor to the largest creditor.
 */
export function calculatePairwiseDebts(
  netBalances: Record<string, number>
): SettlementTransaction[] {
  const creditors = Object.entries(netBalances)
    .filter(([, bal]) => bal > 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bal]) => ({ name, amount: bal }));

  const debtors = Object.entries(netBalances)
    .filter(([, bal]) => bal < -0.5)
    .sort((a, b) => a[1] - b[1])
    .map(([name, bal]) => ({ name, amount: -bal }));

  const transactions: SettlementTransaction[] = [];

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const payment = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(payment),
    });

    debtor.amount -= payment;
    creditor.amount -= payment;

    if (debtor.amount < 0.5) i++;
    if (creditor.amount < 0.5) j++;
  }

  return transactions;
}

/**
 * Compute live settlement for an active game.
 * Returns net dollar balances per player and pairwise "who owes whom" transactions.
 */
/**
 * Zero-sum main-game money by format. Replaces the old
 * totalScores × pointValue math that created money from nowhere.
 *
 * Conventions:
 *  - skins (any N): each skin is worth $v FROM EVERY OTHER player.
 *    balance[p] = v × (N × skins[p] − totalSkins)  (exact, zero-sum)
 *  - match-play 2p (match_play, nassau, best_ball_2): diff × $ transfers.
 *  - 2-team match play (best_ball_4, nassau_4, team_best_ball):
 *    team hole-diff × $ transfers between team members.
 *  - vegas: team point-diff × $ transfers.
 *  - stroke-count games (stroke_play, scramble, shamble, team_scramble,
 *    alternate_shot*): strokes vs field mean, lower better.
 *  - positive-point games (wolf*, sixes, nine_point, stableford, par_birdie,
 *    bingo_bango_bongo, dots_junk): points vs field mean.
 *  - already-zero-sum games (hammer, banker): raw points × $.
 */
export function computeMainGameBalances(
  game: Game,
  pointValue: number,
): { balances: Record<string, number>; mode: string } {
  const v = pointValue || 0;
  const players = game.players;
  const N = players.length;
  const total = (p: string) => game.totalScores?.[p] ?? 0;

  const vsMean = (lowerBetter = false) => {
    const vals = players.map(total);
    const mean = vals.reduce((a, b) => a + b, 0) / (N || 1);
    const out: Record<string, number> = {};
    players.forEach(p => {
      const d = total(p) - mean;
      out[p] = (lowerBetter ? -d : d) * v;
    });
    return out;
  };

  const t = game.gameType;

  if (t === "skins" || t === "skins_3" || t === "skins_4") {
    const totalSkins = players.reduce((s, p) => s + total(p), 0);
    const out: Record<string, number> = {};
    players.forEach(p => { out[p] = v * (N * total(p) - totalSkins); });
    return { balances: out, mode: "per-skin from every opponent" };
  }

  if (t === "match_play" || t === "nassau" || t === "best_ball_2") {
    const [a, b] = players;
    const diff = total(a) - total(b);
    return { balances: { [a]: diff * v, [b]: -diff * v }, mode: "match diff" };
  }

  if (t === "best_ball_4" || t === "nassau_4" || t === "team_best_ball") {
    const teams = game.teams?.length === 2
      ? game.teams
      : [players.slice(0, Math.ceil(N / 2)), players.slice(Math.ceil(N / 2))];
    const sumA = teams[0].reduce((s, p) => s + total(p), 0);
    const sumB = teams[1].reduce((s, p) => s + total(p), 0);
    const diff = sumA - sumB;
    const out: Record<string, number> = {};
    teams[0].forEach(p => { out[p] = (diff * v) / teams[0].length; });
    teams[1].forEach(p => { out[p] = (-diff * v) / teams[1].length; });
    return { balances: out, mode: "team match diff" };
  }

  if (t === "vegas") {
    const teams = game.teams?.length === 2
      ? game.teams
      : [players.slice(0, 2), players.slice(2)];
    const sumA = teams[0].reduce((s, p) => s + total(p), 0);
    const sumB = teams[1].reduce((s, p) => s + total(p), 0);
    const diff = (sumA - sumB) / 2; // each team member holds the full diff; team transfer = diff
    const out: Record<string, number> = {};
    teams[0].forEach(p => { out[p] = diff * v; });
    teams[1].forEach(p => { out[p] = -diff * v; });
    return { balances: out, mode: "vegas team diff" };
  }

  if (["stroke_play", "scramble", "shamble", "team_scramble", "alternate_shot", "alternate_shot_4"].includes(t)) {
    return { balances: vsMean(true), mode: "strokes vs field" };
  }

  if (t === "hammer" || t === "banker") {
    const out: Record<string, number> = {};
    players.forEach(p => { out[p] = total(p) * v; });
    return { balances: out, mode: "raw zero-sum points" };
  }

  // wolf*, sixes, nine_point, stableford, par_birdie, bingo_bango_bongo, dots_junk, custom
  return { balances: vsMean(), mode: "points vs field" };
}


export function getLiveSettlement(game: Game): LiveSettlement {
  const pointValue = (game.gameSettings as Record<string, any>)?.pointValue || 0;

  const miniGameBalances = computeMiniGameBalances(game);
  const miniGameTotals = computeMiniGameTotals(game);
  const hasMiniGames = Object.values(miniGameBalances).some((v) => Math.abs(v) > 0.01);
  const hasMainGame = pointValue > 0;

  if (!hasMainGame && !hasMiniGames) {
    return {
      netBalances: {},
      mainGameBalances: {},
      miniGameBalances: {},
      miniGameTotals: {},
      transactions: [],
      pointValue: 0,
      hasMainGame: false,
      hasMiniGames: false,
    };
  }

  const mainGameBalances: Record<string, number> = {};
  const netBalances: Record<string, number> = {};

  const { balances: mainBalances } = computeMainGameBalances(game, pointValue);
  game.players.forEach((p) => {
    const main = hasMainGame ? (mainBalances[p] ?? 0) : 0;
    const side = miniGameBalances[p] || 0;
    mainGameBalances[p] = main;
    netBalances[p] = main + side;
  });

  const transactions = calculatePairwiseDebts(netBalances);

  return {
    netBalances,
    mainGameBalances,
    miniGameBalances,
    miniGameTotals,
    transactions,
    pointValue,
    hasMainGame,
    hasMiniGames,
  };
}
