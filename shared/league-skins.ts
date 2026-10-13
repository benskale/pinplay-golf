/**
 * Weekly League Skins — pot-based payout engine.
 *
 * The scenario: a weekly game where every player pays $X buy-in, the whole
 * field plays skins across all pods, and the pot pays out by skins won.
 *
 * Correct economics (the way real skins leagues run it):
 *   • Each player pays BUY-IN $X upfront. Pot = N × X.
 *   • A skin is won by the single lowest NET score on a hole (field-wide,
 *     across pods — already computed by computeSkinsField).
 *   • Ties carry; a hole still tied at 18 carries into the pot residue.
 *   • PAYOUT MODES:
 *       - per_skin:    each skin worth an equal share. skinValue = pot / 18
 *                      (18 skins max, carried holes lump into the winner).
 *                      Player payout = skinsWon × skinValue. Remainder
 *                      (rounding, unplayed holes) splits evenly or rolls to
 *                      next week per carryoverRollover flag.
 *       - winner_take_all: most skins takes the pot (ties split).
 *       - proportional:  payout_i = pot × skinsWon_i / totalSkinsWon
 *                        (players with 0 skins get nothing; if no skins won
 *                        at all — everyone tied everything — pot rolls).
 *   • Optional rake for the course/org (default 0).
 *   • Everything zero-sum: payouts + rollover + rake == pot, always.
 */

export interface LeagueSkinsConfig {
  buyIn: number;                  // per player
  payoutMode: "per_skin" | "winner_take_all" | "proportional";
  carryoverRollover: boolean;     // unclaimed pot (rounding/no-skins) rolls to next week vs splits evenly
  rakePct?: number;               // optional org cut, 0-100
}

export interface LeagueSkinsResult {
  pot: number;
  rake: number;
  netPot: number;                          // pot - rake
  perPlayerCost: Record<string, number>;   // -buyIn for everyone
  payouts: Record<string, number>;         // gross winnings
  net: Record<string, number>;             // payouts - buyIn
  skinValue?: number;                      // per_skin mode
  rollover: number;                        // money carried to next week
  summary: string[];                       // human-readable lines
}

/** Cents-safe money math */
const cents = (x: number) => Math.round(x * 100) / 100;

export function settleLeagueSkins(
  players: string[],
  skinsWon: Record<string, number>,   // from computeSkinsField (carries already merged)
  holesPlayed: number,                // e.g. 18
  cfg: LeagueSkinsConfig,
): LeagueSkinsResult {
  const N = players.length;
  const pot = cents(N * cfg.buyIn);
  const rake = cents(pot * ((cfg.rakePct ?? 0) / 100));
  const netPot = cents(pot - rake);

  const totalSkins = players.reduce((s, p) => s + (skinsWon[p] ?? 0), 0);
  const payouts: Record<string, number> = {};
  players.forEach(p => { payouts[p] = 0; });
  let rollover = 0;
  let skinValue: number | undefined;
  const summary: string[] = [];

  if (cfg.payoutMode === "per_skin") {
    const denominator = Math.max(holesPlayed, 1);
    skinValue = cents(netPot / denominator);
    players.forEach(p => { payouts[p] = cents((skinsWon[p] ?? 0) * skinValue!); });
    const paid = players.reduce((s, p) => s + payouts[p], 0);
    rollover = cents(netPot - paid);
    summary.push(`Pot $${pot.toFixed(2)} (${N} × $${cfg.buyIn}) · each skin worth $${skinValue.toFixed(2)}`);
    if (rollover > 0) {
      summary.push(cfg.carryoverRollover
        ? `$${rollover.toFixed(2)} unclaimed (carry/no-result holes) rolls to next week`
        : "unclaimed remainder splits evenly");
      if (!cfg.carryoverRollover && rollover > 0) {
        const share = cents(rollover / N);
        players.forEach(p => { payouts[p] = cents(payouts[p] + share); });
        rollover = 0;
      }
    }
  } else if (cfg.payoutMode === "winner_take_all") {
    const maxSkins = Math.max(0, ...players.map(p => skinsWon[p] ?? 0));
    if (maxSkins === 0) {
      rollover = netPot;
      summary.push("No skins won — entire pot rolls to next week");
    } else {
      const winners = players.filter(p => (skinsWon[p] ?? 0) === maxSkins);
      const share = cents(netPot / winners.length);
      winners.forEach(p => { payouts[p] = share; });
      const paid = share * winners.length;
      rollover = cents(netPot - paid);
      summary.push(`Top skin winner${winners.length > 1 ? "s (tie, split)" : ""}: ${winners.join(", ")} take${winners.length === 1 ? "s" : ""} $${netPot.toFixed(2)}`);
      if (rollover > 0 && !cfg.carryoverRollover) {
        const share2 = cents(rollover / N);
        players.forEach(p => { payouts[p] = cents(payouts[p] + share2); });
        rollover = 0;
      }
    }
  } else {
    // proportional
    if (totalSkins === 0) {
      rollover = netPot;
      summary.push("No skins won — entire pot rolls to next week");
    } else {
      players.forEach(p => {
        payouts[p] = cents(netPot * ((skinsWon[p] ?? 0) / totalSkins));
      });
      const paid = players.reduce((s, p) => s + payouts[p], 0);
      rollover = cents(netPot - paid);
      summary.push(`Pot split proportionally across ${totalSkins} skins`);
      if (rollover > 0) {
        if (cfg.carryoverRollover) {
          summary.push(`$${rollover.toFixed(2)} rounding remainder rolls to next week`);
        } else {
          const share = cents(rollover / N);
          players.forEach(p => { payouts[p] = cents(payouts[p] + share); });
          rollover = 0;
        }
      }
    }
  }

  if (rake > 0) summary.unshift(`Org rake ${cfg.rakePct}% = $${rake.toFixed(2)}`);

  const net: Record<string, number> = {};
  const perPlayerCost: Record<string, number> = {};
  players.forEach(p => {
    perPlayerCost[p] = -cfg.buyIn;
    net[p] = cents(payouts[p] - cfg.buyIn);
  });

  // invariant: payouts + rollover === netPot
  const paidTotal = players.reduce((s, p) => s + payouts[p], 0);
  if (Math.abs(paidTotal + rollover - netPot) > 0.02) {
    throw new Error(`settlement invariant violated: paid ${paidTotal} + roll ${rollover} != pot ${netPot}`);
  }

  return { pot, rake, netPot, perPlayerCost, payouts, net, skinValue, rollover, summary };
}
