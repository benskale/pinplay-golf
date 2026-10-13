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

  game.players.forEach((p) => {
    const main = hasMainGame ? (game.totalScores?.[p] ?? 0) * pointValue : 0;
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
