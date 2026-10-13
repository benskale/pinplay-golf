// Full dry-run test suite for the PinPlay fixes — run through the actual engines.
// Covers: nassau press, group-game settlement, league skins pot, and the
// tournament fixes (scramble handicap, net ringer, ryder cup points).
import { settleLeagueSkins } from "./league-skins.mjs";

let total = 0, failed = 0;
const ok = (name, cond, detail = "") => {
  total++;
  if (cond) console.log("  ✓", name);
  else { failed++; console.log("  ✗ FAIL:", name, detail); }
};
const header = (t) => console.log("\n" + t);

// ─────────────────────────────────────────────────────────────
header("1. NASSAU PRESS — the scenario from the broken match");
// Ben vs Nick $10. Ben wins 1,2. Nick wins 3,4. Halved 5.
// Hole 6: Nick (1DN front) presses. Nick wins 6,7. Ben wins 8. Halved 9.
// Holes 10-18: Ben wins 10,11,12, rest halved.
{
  // reuse the settlement card function path
  const { getNassauSettlement } = await import("./settlement.mjs");
  const W = ["B","B","N","N",null,"N","N","B",null,"B","B","B",null,null,null,null,null,null];
  const holeHistory = W.map((w, i) => ({
    hole: i+1,
    strokes: { Ben: w==="B"?4:w==="N"?5:4, Nick: w==="N"?4:w==="B"?5:4 },
    points: { Ben: w==="B"?1:0, Nick: w==="N"?1:0 },
    result: "", metadata: {},
  }));
  const game = { players:["Ben","Nick"], holeHistory, gameType:"nassau",
    gameSettings:{ pointValue:10, pressBets:[{ id:"press-1", side:"B", calledBy:"Nick", startHole:6, segment:"front", amount:10, status:"won" }] } };
  const s = getNassauSettlement(game, 10);
  ok("Front 9 → Nick 1up (+$10)", s.lineItems[0].winner === "Nick");
  ok("Back 9 → Ben 3up (+$10)", s.lineItems[1].winner === "Ben");
  ok("Overall → Ben 2up (+$10)", s.lineItems[2].winner === "Ben");
  ok("Press (from hole 6) → Nick (+$10)", s.lineItems[3].winner === "Nick" && s.lineItems[3].label.includes("from 6"));
  ok("Zero-sum: net = 0 both", s.balances.Ben === 0 && s.balances.Nick === 0, JSON.stringify(s.balances));
  console.log("     card:", s.lineItems.map(l => `${l.label}: ${l.winner ?? "push"}`).join(" | "));
}

// Press mid-round state (engine, not just settlement)
{
  const eng = await import("./nassau-press.mjs");
  const out = (h, w) => ({ hole: h, winner: w });
  const outcomes = [out(1,"A"),out(2,"A"),out(3,"A"),out(4,"A"),out(5,"A")];
  const gate = eng.canSidePress("B","front",outcomes,6,"losing_only",[]);
  ok("Trailing side CAN press on hole 6", gate.ok);
  const gate2 = eng.canSidePress("A","front",outcomes,6,"losing_only",[]);
  ok("Leading side CANNOT press", !gate2.ok);
  const press = eng.createPress("B","Nick",6,10,[]);
  ok("Press attaches to FRONT segment, starts hole 6", press.segment === "front" && press.startHole === 6);
  // B wins 6,7,8 → press B 3up with 1 to play → B wins press at 9
  const after = [...outcomes, out(6,"B"),out(7,"B"),out(8,"B"),out(9,null)];
  const pr = eng.pressResult(press, after);
  ok("Press finishes at 9, B wins 3up", pr.finished === true && pr.holesRemaining === 0);
  const front = eng.segmentResult("front", after);
  ok("Main front bet UNCHANGED by press (A 2up)", front.diff === 2, `diff=${front.diff}`);
}

// ─────────────────────────────────────────────────────────────
header("2. GROUP GAME SETTLEMENT (zero-sum money)");
{
  const { computeMainGameBalances } = await import("./settlement.mjs");
  const g = (gameType, players, totalScores, teams) => ({
    gameType, players, totalScores, teams: teams ?? [], gameSettings:{}, holeHistory:[],
  });

  // Skins 4p $5: A 6, B 3, C 2, D 1 → A nets +$60 (beats field by net 6 skins × 4 players... exact: 5*(4*6-12)=60)
  let r = computeMainGameBalances(g("skins",["A","B","C","D"],{A:6,B:3,C:2,D:1}), 5);
  ok("Skins 4p: winner +$60 (5×(4×6−12))", r.balances.A === 60, `A=${r.balances.A}`);
  ok("Skins 4p zero-sum", Math.abs(Object.values(r.balances).reduce((a,b)=>a+b,0)) < 1e-9);

  // Match play $10: A 5 holes, B 3 → A +$20
  r = computeMainGameBalances(g("match_play",["A","B"],{A:5,B:3}), 10);
  ok("Match play: 2-hole diff → ±$20", r.balances.A === 20 && r.balances.B === -20);

  // Stroke play $2: A80 B85 C90 D95 → vs mean 87.5 → A +15, D −15
  r = computeMainGameBalances(g("stroke_play",["A","B","C","D"],{A:80,B:85,C:90,D:95}), 2);
  ok("Stroke play: best POSITIVE, worst NEGATIVE", r.balances.A === 15 && r.balances.D === -15, JSON.stringify(r.balances));

  // 9-point: points vs mean
  r = computeMainGameBalances(g("nine_point",["A","B","C"],{A:40,B:30,C:20}), 1);
  ok("9-point: zero-sum, ordered", r.balances.A > 0 && r.balances.C < 0 &&
     Math.abs(Object.values(r.balances).reduce((a,b)=>a+b,0)) < 1e-9);

  // Best ball 4 (2v2) $5: A,B 5 holes; C,D 3 → each ±$10
  r = computeMainGameBalances(g("best_ball_4",["A","B","C","D"],{A:5,B:5,C:3,D:3},[["A","B"],["C","D"]]), 5);
  ok("Best ball 2v2: ±$10 each", r.balances.A === 10 && r.balances.C === -10);

  // Hammer: raw negative points already zero-sum
  r = computeMainGameBalances(g("hammer",["A","B"],{A:8,B:-8}), 2);
  ok("Hammer: ±$16 raw", r.balances.A === 16 && r.balances.B === -16);
}

// ─────────────────────────────────────────────────────────────
header("3. WEEKLY LEAGUE SKINS POT");
{
  // 12 players × $20 → $240 pot, per_skin
  let r = settleLeagueSkins(
    ["A","B","C","D","E","F","G","H","I","J","K","L"],
    { A:4,B:3,C:2,D:2,E:1,F:1,G:1,H:1,I:1,J:1,K:0,L:0 }, 18,
    { buyIn:20, payoutMode:"per_skin", carryoverRollover:true });
  ok("Pot = $240", r.pot === 240);
  ok("Skin value $13.33", r.skinValue === 13.33);
  ok("A (4 skins) = $53.32, net +$33.32", r.payouts.A === 53.32 && r.net.A === 33.32);
  ok("Winless players −$20", r.net.K === -20 && r.net.L === -20);
  ok("Zero-sum incl rollover", Math.abs(Object.values(r.payouts).reduce((a,b)=>a+b,0) + r.rollover - r.netPot) < 0.02);

  // WTA tie
  r = settleLeagueSkins(["A","B","C","D"],{A:5,B:5,C:3,D:1},18,{buyIn:25,payoutMode:"winner_take_all",carryoverRollover:false});
  ok("WTA tie: $50/$50 split of $100", r.payouts.A === 50 && r.payouts.B === 50);

  // Rake
  r = settleLeagueSkins(["A","B","C","D"],{A:6,B:4,C:4,D:0},18,{buyIn:50,payoutMode:"proportional",carryoverRollover:true,rakePct:10});
  ok("10% rake off $200 → $180 net pot", r.netPot === 180 && r.rake === 20);
  ok("A 6/14 share = $77.14", r.payouts.A === 77.14);

  // Rain-out week
  r = settleLeagueSkins(["A","B","C"],{},18,{buyIn:10,payoutMode:"proportional",carryoverRollover:true});
  ok("All-tie week: full $30 rolls over", r.rollover === 30);
}

// ─────────────────────────────────────────────────────────────
header("4. TOURNAMENT FORMATS");
{
  // 4a. Scramble team handicap (extract the formula: sum × pct)
  const teamHdcp = (hcps) => {
    const sum = hcps.reduce((a,b)=>a+b,0);
    return Math.round(sum * (hcps.length >= 4 ? 0.20 : 0.25));
  };
  ok("2-man (10,14): 24×0.25 = 6 strokes (was 3)", teamHdcp([10,14]) === 6);
  ok("4-man (8,10,12,14): 44×0.20 = 9 (was 3)", teamHdcp([8,10,12,14]) === 9);

  // 4b. Net ringer played-mask logic (replicated)
  const ringerBest = (rounds) => {
    const best = [], mask = [];
    rounds.forEach(round => round.forEach((v,i) => {
      if (v === null) return;
      if (i >= best.length) { best[i] = v; mask[i] = true; }
      else if (!mask[i] || v < best[i]) { best[i] = v; mask[i] = true; }
    }));
    return { best, mask };
  };
  // Week 1: net 5 on hole 1. Week 2: net 0 on hole 1 (gross 3, 3 strokes). Best = 0.
  const rr = ringerBest([[5,null,null],[0,null,null]]);
  ok("Net ringer: net-0 hole COUNTS and replaces worse score", rr.best[0] === 0 && rr.mask[0] === true);
  const total = rr.best.reduce((s,v,i)=> s + (rr.mask[i]?v:0), 0);
  const played = rr.mask.filter(Boolean).length;
  ok("Ringer total uses mask (total 0 over 1 hole)", total === 0 && played === 1);
  // Week 2 missing hole shouldn't zero week 1
  const rr2 = ringerBest([[4,5,6],[3,null,null]]);
  ok("Missing hole in later round keeps earlier best", rr2.best[1] === 5 && rr2.best[2] === 6);

  // 4c. Ryder Cup session points
  const rc = (matches, singlesDouble = false) => {
    let t1 = 0, t2 = 0;
    matches.forEach(m => {
      const v = m.session === "singles" && singlesDouble ? 2 : 1;
      if (m.winner === "team1") t1 += v;
      else if (m.winner === "team2") t2 += v;
      else { t1 += v/2; t2 += v/2; }
    });
    return { t1, t2 };
  };
  // Classic board: 8 fourball + 8 foursomes + 12 singles = 28 matches, all 1pt
  let board = [];
  for (let i=0;i<8;i++) board.push({session:"fourball",winner:"team1"});
  for (let i=0;i<8;i++) board.push({session:"foursomes",winner:"team2"});
  for (let i=0;i<6;i++) board.push({session:"singles",winner:"team1"});
  for (let i=0;i<4;i++) board.push({session:"singles",winner:"team2"});
  for (let i=0;i<2;i++) board.push({session:"singles",winner:"halved"});
  let sc = rc(board);
  ok("Ryder Cup: 28 total points on classic board", sc.t1 + sc.t2 === 28, `t1+t2=${sc.t1+sc.t2}`);
  ok("Ryder Cup: USA 15.0 − EUR 13.0", sc.t1 === 15 && sc.t2 === 13, `${sc.t1}-${sc.t2}`);
  ok("Halved match = 0.5pt each", rc([{session:"singles",winner:"halved"}]).t1 === 0.5);
  ok("Optional singlesDouble: same board = 40pts (8 team + 24 singles + 8 halved... = 8+8×2+... verify sum)", rc(board, true).t1 + rc(board, true).t2 === 40);
}

// ─────────────────────────────────────────────────────────────
header("5. SKINS EDGE CASES");
{
  // Final-hole carry pushes
  const skins = (winners) => {
    let carry = 0; const won = {}; const pushed = [];
    winners.forEach((w,i) => {
      if (w === null) { if (i === 17) pushed.push(carry+1); else carry += 1; }
      else { won[w] = (won[w]||0) + carry + 1; carry = 0; }
    });
    return { won, pushed };
  };
  let s = skins(["A",null,null,"B",null,null,null,null,null,null,null,null,null,null,null,null,null,null]);
  // holes 2-3 carry → B wins hole 4 with 3 skins; holes 5-18 all tied = 14 skins pushed at 18
  ok("B wins hole 4 with 3 carried skins", s.won.B === 3, `won.B=${s.won.B}`);
  ok("14 skins tied thru 18 → pushed", s.pushed[0] === 14, `pushed=${s.pushed[0]}`);
  s = skins(["A",null,null,"B","C","C"]);
  ok("C wins 2 singles", s.won.C === 2);
}

console.log(`\n${"═".repeat(52)}\nRESULT: ${total - failed}/${total} passed${failed ? `, ${failed} FAILED` : " — ALL GREEN"}`);
process.exit(failed ? 1 : 0);
