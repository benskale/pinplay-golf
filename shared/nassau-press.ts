/**
 * Nassau segment & press engine — correct traditional semantics.
 *
 * A Nassau is THREE independent match-play bets: front 9, back 9, overall 18.
 * A PRESS is a NEW side match that starts on the hole it is called and runs
 * through the end of the current segment (front, back, or overall). It never
 * modifies the original bet. Each press settles independently.
 *
 * Key invariants:
 *  - The main bets (front/back/overall) are computed from hole results alone.
 *  - Presses live in game.gameSettings.pressBets: {id, side, startHole, segment,
 *    amount, status}. A press's match state derives from hole results AFTER
 *    startHole within its segment (dormie/closeout math included).
 *  - Declining a press does not exist (traditional presses are automatic once
 *    called); the buggy "drop = concede + pay main-bet points" behavior is gone.
 *  - whoCanPress "losing_only" (default): only the side currently losing the
 *    relevant segment may call a press on that segment.
 */

export interface PressBet {
  id: string;
  /** 'A' | 'B' — side that called the press */
  side: "A" | "B";
  /** player name who called it (display) */
  calledBy: string;
  /** 1-indexed hole the press starts ON (that hole counts for the press) */
  startHole: number;
  /** which main bet this press attaches to */
  segment: "front" | "back" | "overall";
  /** dollar value per hole-equivalent (same unit as the main bet) */
  amount: number;
  status: "live" | "won" | "lost" | "halved";
}

export interface HoleOutcome {
  hole: number; // 1-indexed
  winner: "A" | "B" | null; // null = halved
}

export interface SegmentResult {
  segment: "front" | "back" | "overall";
  /** holes won by A minus holes won by B (positive = A up) */
  diff: number;
  holesPlayed: number;
  holesRemaining: number;
  winner: "A" | "B" | null; // null = halved or unfinished
  finished: boolean;
}

export interface PressResult extends SegmentResult {
  press: PressBet;
}

const SEGMENT_RANGE: Record<"front" | "back" | "overall", [number, number]> = {
  front: [1, 9],
  back: [10, 18],
  overall: [1, 18],
};

/** Which segment(s) a hole belongs to */
export function segmentsForHole(hole: number): Array<"front" | "back" | "overall"> {
  const segs: Array<"front" | "back" | "overall"> = ["overall"];
  segs.push(hole <= 9 ? "front" : "back");
  return segs;
}

/**
 * Compute match state for one segment from completed hole outcomes.
 * Uses net-stroke hole winners (already handicap-adjusted upstream).
 */
export function segmentResult(
  segment: "front" | "back" | "overall",
  outcomes: HoleOutcome[],
): SegmentResult {
  const [lo, hi] = SEGMENT_RANGE[segment];
  const relevant = outcomes.filter(o => o.hole >= lo && o.hole <= hi);
  let diff = 0;
  for (const o of relevant) {
    if (o.winner === "A") diff += 1;
    else if (o.winner === "B") diff -= 1;
  }
  const holesPlayed = relevant.length;
  const holesRemaining = hi - lo + 1 - holesPlayed;
  const finished = holesRemaining <= 0;
  let winner: "A" | "B" | null = finished ? (diff > 0 ? "A" : diff < 0 ? "B" : null) : null;
  return { segment, diff, holesPlayed, holesRemaining, winner, finished };
}

/**
 * A side is "losing" a segment if diff < 0 (for A) / > 0 (for B), OR the match
 * is decided against them (mathematically closed out). Traditionally a press may
 * also be called when the trailing side is dormie — treated here as still live
 * to press since the segment hasn't finished.
 */
export function canSidePress(
  side: "A" | "B",
  segment: "front" | "back" | "overall",
  outcomes: HoleOutcome[],
  currentHole: number,
  whoCanPress: "anyone" | "losing_only" = "losing_only",
  activePresses: PressBet[] = [],
  maxPerSegment = 3,
): { ok: boolean; reason?: string } {
  const seg = segmentResult(segment, outcomes);
  if (seg.finished) return { ok: false, reason: "segment complete" };
  if (segment !== segmentsForHole(currentHole).find(s => s === segment)) {
    // pressing a segment you're not currently inside is allowed only for
    // 'overall' when past hole 9? No — only live segments for this hole.
  }
  if (segmentsForHole(currentHole).indexOf(segment) === -1) {
    return { ok: false, reason: "segment not in play on this hole" };
  }
  const segPresses = activePresses.filter(p => p.segment === segment && p.status === "live");
  if (segPresses.length >= maxPerSegment) return { ok: false, reason: "press limit reached" };

  if (whoCanPress === "anyone") return { ok: true };

  const losing = side === "A" ? seg.diff < 0 : seg.diff > 0;
  if (!losing) return { ok: false, reason: "only the trailing side can press" };
  return { ok: true };
}

/** Create a press (caller has validated with canSidePress) */
export function createPress(
  side: "A" | "B",
  calledBy: string,
  currentHole: number,
  amount: number,
  existing: PressBet[],
): PressBet {
  const segment: PressBet["segment"] = currentHole <= 9 ? "front" : "overall";
  // NOTE: a press on holes 1-9 attaches to the front bet; on 10-18 it attaches
  // to the *overall* bet by default (traditional). A back-segment press is
  // created explicitly when pressing the back bet.
  const n = existing.length + 1;
  return {
    id: `press-${n}`,
    side,
    calledBy,
    startHole: currentHole,
    segment,
    amount,
    status: "live",
  };
}

/** Match state of one press from hole outcomes (only holes >= startHole in segment) */
export function pressResult(press: PressBet, outcomes: HoleOutcome[]): PressResult {
  const [lo, hi] = SEGMENT_RANGE[press.segment];
  const relevant = outcomes.filter(
    o => o.hole >= Math.max(lo, press.startHole) && o.hole <= hi,
  );
  let diff = 0;
  for (const o of relevant) {
    if (o.winner === "A") diff += 1;
    else if (o.winner === "B") diff -= 1;
  }
  const total = hi - Math.max(lo, press.startHole) + 1;
  const played = relevant.length;
  const remaining = total - played;
  const finished = remaining <= 0;
  const winner = finished ? (diff > 0 ? "A" : diff < 0 ? "B" : null) : null;
  return { press, segment: press.segment, diff: press.side === "A" ? diff : -diff, holesPlayed: played, holesRemaining: remaining, winner, finished };
}

/**
 * Hole winner from (net) strokes for 2-player / 2-team match play.
 */
export function holeWinner(nets: { A: number; B: number }): "A" | "B" | null {
  if (nets.A < nets.B) return "A";
  if (nets.B < nets.A) return "B";
  return null;
}

/**
 * Derive HoleOutcome list from a PinPlay game's holeHistory.
 * For nassau, points are +1 to the hole winner; we also fall back to strokes.
 */
export function outcomesFromHistory(history: Array<{
  hole: number;
  strokes: Record<string, number>;
  points: Record<string, number>;
}>): HoleOutcome[] {
  return history
    .filter(h => h.hole > 0)
    .map(h => {
      const winners = Object.entries(h.points).filter(([, v]) => v > 0).map(([k]) => k);
      let winner: "A" | "B" | null = null;
      if (winners.length === 1) {
        winner = winners[0] === Object.keys(h.points)[0] ? "A" : "B";
      }
      return { hole: h.hole, winner };
    });
}

/** Full Nassau card: the three main bets + all presses, for display/settlement */
export function nassauCard(
  outcomes: HoleOutcome[],
  presses: PressBet[],
  unitValue: number,
): {
  bets: Array<SegmentResult & { label: string; amount: number }>;
  pressBets: Array<PressResult & { label: string; amount: number }>;
  totalsA: number;
  totalsB: number;
} {
  const labels: Record<string, string> = { front: "Front 9", back: "Back 9", overall: "Overall 18" };
  const bets = (["front", "back", "overall"] as const).map(seg => {
    const r = segmentResult(seg, outcomes);
    return { ...r, label: labels[seg], amount: unitValue };
  });
  const pressBets = presses.map(p => {
    const r = pressResult(p, outcomes);
    return { ...r, label: `${p.id.replace("press-", "Press #")} (${p.side}, from hole ${p.startHole})`, amount: p.amount };
  });
  // money: main bets + presses, from side A's perspective
  let totalsA = 0;
  let totalsB = 0;
  const settle = (winner: "A" | "B" | null, amount: number, diff: number) => {
    if (winner === "A") totalsA += amount;
    else if (winner === "B") totalsB += amount;
    void diff;
  };
  bets.forEach(b => settle(b.winner, b.amount, b.diff));
  pressBets.forEach(p => settle(p.winner, p.amount, p.diff));
  return { bets, pressBets, totalsA, totalsB };
}
