import type { Game } from "@shared/schema";

export interface SettlementTransaction {
  from: string;
  to: string;
  amount: number;
}

export interface LiveSettlement {
  netBalances: Record<string, number>;
  transactions: SettlementTransaction[];
  pointValue: number;
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

  if (pointValue === 0) {
    return { netBalances: {}, transactions: [], pointValue: 0 };
  }

  const netBalances: Record<string, number> = {};
  game.players.forEach((p) => {
    netBalances[p] = (game.totalScores?.[p] ?? 0) * pointValue;
  });

  const transactions = calculatePairwiseDebts(netBalances);

  return { netBalances, transactions, pointValue };
}
