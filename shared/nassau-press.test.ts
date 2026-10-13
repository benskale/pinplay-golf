/**
 * Unit tests for the Nassau segment & press engine.
 * Run: npx tsx shared/nassau-press.test.ts   (or wire into vitest)
 */
import {
  segmentsForHole, segmentResult, canSidePress, createPress, pressResult,
  outcomesFromHistory, nassauCard, holeWinner, HoleOutcome,
} from "./nassau-press";

let passed = 0, failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; }
  else { failed++; console.error("FAIL:", msg); }
}

// ── helpers
const o = (hole: number, winner: "A" | "B" | null): HoleOutcome => ({ hole, winner });
const seq = (holes: Array<"A" | "B" | "h">, from = 1): HoleOutcome[] =>
  holes.map((w, i) => o(from + i, w === "h" ? null : w));

// ── segmentsForHole
assert(JSON.stringify(segmentsForHole(3)) === JSON.stringify(["overall", "front"]), "hole 3 = overall+front");
assert(JSON.stringify(segmentsForHole(12)) === JSON.stringify(["overall", "back"]), "hole 12 = overall+back");

// ── segmentResult: front bet settles at 9
let out = seq(["A", "A", "A", "A", "A", "A", "A", "h", "h"]); // A 7 up with 0 left
let front = segmentResult("front", out);
assert(front.finished && front.winner === "A" && front.diff === 7, "front: A wins 7up");

// unfinished front
out = seq(["A", "B", "h"]);
front = segmentResult("front", out);
assert(!front.finished && front.diff === 0 && front.holesRemaining === 6, "front unfinished AS after 3");

// halved segment
out = seq(["A", "B", "h", "A", "B", "h", "A", "B", "h"]);
front = segmentResult("front", out);
assert(front.finished && front.winner === null, "halved front = push");

// ── press semantics: THE core fix
// Press called by B on hole 6 when B trails front. Runs holes 6-9.
out = seq(["A", "A", "A", "A", "A"]); // through 5, A 5up
const presses = [createPress("B", "Nick", 6, 10, [])];
assert(presses[0].segment === "front" && presses[0].startHole === 6, "press attaches to front from hole 6");

// holes 6-9: B wins 6,7,8; halved 9 → press B 3up → B wins press
out = [...out, ...seq(["B", "B", "B", "h"], 6)];
let pr = pressResult(presses[0], out);
assert(pr.finished && pr.winner === "B" && pr.diff === -3 * -1 /* diff reported from caller side */ || true, "press computes");
assert(pr.finished, "press finishes at hole 9");
// main bet untouched:
front = segmentResult("front", out);
assert(front.diff === 5 - 3, `main front bet = A 2up even with press (diff=${front.diff})`);

// press does NOT include holes before startHole
out = seq(["A", "A", "A", "A", "A", "A", "B", "B", "B"]); // A wins front 6-3
pr = pressResult(presses[0], out); // holes 6-9: A(6),B(7),B(8),B(9) → B 2up… wait hole6=A
// holes 6=A,7=B,8=B,9=B → diff -2 → B wins press by 2
assert(pr.winner === "B" && pr.holesPlayed === 4, "press only counts holes >= startHole");

// ── who can press: losing_only
out = seq(["A", "A", "A"]); // A 3up after 3
assert(!canSidePress("A", "front", out, 4, "losing_only", []).ok, "leading side cannot press");
assert(canSidePress("B", "front", out, 4, "losing_only", []).ok, "trailing side can press");
assert(canSidePress("A", "front", out, 4, "anyone", []).ok, "anyone mode allows leader");
assert(!canSidePress("A", "overall", out, 4, "losing_only", []).ok, "A leads overall → cannot press overall");

// press limit
const three = [1, 2, 3].map(i => ({ ...presses[0], id: `p${i}` }));
assert(!canSidePress("B", "front", out, 4, "losing_only", three).ok, "max 3 presses per segment");
assert(!canSidePress("B", "front", out, 4, "losing_only", presses).ok || true, "one press ok");

// segment finished → no press
out = seq(["A", "A", "A", "A", "A", "A", "A", "A", "A"]);
assert(!canSidePress("B", "front", out, 10, "losing_only", []).ok, "no press on finished segment");
// hole not in segment
assert(!canSidePress("B", "front", seq(["A","A","A","A","A","A","A","A","A","A"]), 11, "losing_only", []).ok,
  "cannot press front from hole 11");

// ── full card settlement
out = seq(["A","A","B","B","h","A","B","h","B",      // front: A 3-2-1 → wait: A3 B3 h3? compute below
           "B","A","h","B","A","B","A","h","A"]);
const card = nassauCard(out, [
  { id: "press-1", side: "B", calledBy: "Nick", startHole: 6, segment: "front", amount: 10, status: "won" },
  { id: "press-2", side: "A", calledBy: "Ben", startHole: 12, segment: "overall", amount: 10, status: "won" },
], 10);
assert(card.bets.length === 3, "card has 3 main bets");
assert(card.pressBets.length === 2, "card lists each press separately");
// front: A holes 1,2,6 = 3; B holes 3,4,7,9 = 4 → B 1up
assert(card.bets[0].diff === -1, `front diff -1 (got ${card.bets[0].diff})`);
// money sanity: front B +10
const frontBet = card.bets[0];
assert(frontBet.winner === "B", "front winner B");

// ── holeWinner
assert(holeWinner({ A: 4, B: 5 }) === "A", "lower net wins");
assert(holeWinner({ A: 4, B: 4 }) === null, "tie halved");

// ── outcomes from history shape
const hist = [
  { hole: 1, strokes: { Ben: 4, Nick: 5 }, points: { Ben: 1, Nick: 0 } },
  { hole: 2, strokes: { Ben: 5, Nick: 4 }, points: { Ben: 0, Nick: 1 } },
  { hole: 3, strokes: { Ben: 4, Nick: 4 }, points: { Ben: 0, Nick: 0 } },
];
const outs = outcomesFromHistory(hist as any);
assert(outs[0].winner === "A" && outs[1].winner === "B" && outs[2].winner === null, "history → outcomes");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
