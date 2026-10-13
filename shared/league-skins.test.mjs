// Weekly league skins payout tests
import { settleLeagueSkins } from "./league-skins.mjs";

let failed = 0;
const check = (name, cond, detail = "") => {
  if (!cond) { failed++; console.error("FAIL:", name, detail); }
  else console.log("ok:", name);
};

// Scenario A: 12 players × $20, 18 holes, per_skin, no rake
let r = settleLeagueSkins(
  ["A","B","C","D","E","F","G","H","I","J","K","L"],
  { A: 4, B: 3, C: 2, D: 2, E: 1, F: 1, G: 1, H: 1, I: 1, J: 1, K: 0, L: 0 },  // 18 skins incl 1 carry lump
  18,
  { buyIn: 20, payoutMode: "per_skin", carryoverRollover: true },
);
check("pot = 240", r.pot === 240);
check("skin value = 13.33", r.skinValue === 13.33, `got ${r.skinValue}`);
check("A wins 4 skins = 53.32", r.payouts.A === 53.32, `got ${r.payouts.A}`);
check("A net = 33.32", r.net.A === 33.32);
check("K net = -20", r.net.K === -20 && r.net.L === -20);
check("zero-sum + rollover = netPot",
  Math.abs(Object.values(r.payouts).reduce((a,b)=>a+b,0) + r.rollover - r.netPot) < 0.02);

// Scenario B: winner_take_all with a tie
r = settleLeagueSkins(["A","B","C","D"], { A: 5, B: 5, C: 3, D: 1 }, 18,
  { buyIn: 25, payoutMode: "winner_take_all", carryoverRollover: false });
check("WTA tie splits 100/50/50", r.payouts.A === 50 && r.payouts.B === 50, JSON.stringify(r.payouts));
check("WTA zero-sum", Math.abs(Object.values(r.payouts).reduce((a,b)=>a+b,0) - 100) < 0.02);

// Scenario C: proportional with rake
r = settleLeagueSkins(["A","B","C","D"], { A: 6, B: 4, C: 4, D: 0 }, 18,
  { buyIn: 50, payoutMode: "proportional", carryoverRollover: true, rakePct: 10 });
check("rake = 20", r.rake === 20);
check("net pot = 180", r.netPot === 180);
check("A gets 6/14 of 180 = 77.14", r.payouts.A === 77.14, `got ${r.payouts.A}`);
check("D gets 0", r.payouts.D === 0);

// Scenario D: no skins won at all (rain-out / all ties)
r = settleLeagueSkins(["A","B","C"], {}, 18,
  { buyIn: 10, payoutMode: "proportional", carryoverRollover: true });
check("all-tie rolls full pot", r.rollover === 30 && Object.values(r.payouts).every(v => v === 0));

// Scenario E: uneven per_skin where remainder rolls
r = settleLeagueSkins(["A","B","C"], { A: 7, B: 6, C: 4 }, 18,
  { buyIn: 10, payoutMode: "per_skin", carryoverRollover: true });
check("3 players × 10 = 30 pot", r.pot === 30);
check("rollover > 0 recorded", r.rollover > 0);
check("per-skin invariant", Math.abs(Object.values(r.payouts).reduce((a,b)=>a+b,0) + r.rollover - 30) < 0.02);

console.log(failed === 0 ? "\nALL LEAGUE SKINS TESTS PASS" : `\n${failed} FAILURES`);
process.exit(failed ? 1 : 0);
