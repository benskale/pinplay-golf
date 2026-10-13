/**
 * PinPlay Press & Nassau — correct rules spec (source of truth).
 *
 * Status: IMPLEMENTED in shared/nassau-press.ts + client/src/hooks/use-press-engine.ts.
 * The legacy per-hole multiplier press in active-game.tsx is deprecated and must
 * be replaced by this engine's UI wiring (in progress).
 *
 * ── The rules ────────────────────────────────────────────────────────────────
 *
 * NASSAU = three independent match-play bets:
 *   • Front 9  (holes 1-9)
 *   • Back 9   (holes 10-18)
 *   • Overall 18
 * Each bet settles on its own match result. A tied bet is a push.
 *
 * PRESS = a new, separate side bet spawned mid-round:
 *   • Starts on the hole where it is called (that hole counts toward the press).
 *   • Runs to the end of the segment it attaches to:
 *       - called during holes 1-9  → attaches to the FRONT bet (ends at 9)
 *       - called during holes 10-18 → attaches to the OVERALL bet (ends at 18)
 *         unless explicitly pressing the BACK bet (ends at 18 either way;
 *         a back-press and an overall-press differ only in label/amount bookkeeping)
 *   • Never modifies the original bet. The main bet continues untouched.
 *   • Settles independently: winner of the press match wins the press amount.
 *   • Multiple presses allowed (default max 3 per segment); each is its own match.
 *
 * WHO can press:
 *   • Traditional default: only the side TRAILING the relevant segment may call.
 *     ("losing_only"). Configurable to "anyone" via gameConfig.pressRules.
 *   • A press cannot be "declined" — once called it exists. (The old app's
 *     "drop = concede + pay main-bet points" behavior was incorrect and is removed.)
 *
 * SETTLEMENT VIEW (18-hole final card):
 *   Front 9          Ben 2&1   $10 → Ben +$10
 *   Back 9           Nick 1up  $10 → Nick +$10
 *   Overall 18       Halved    $10 → push
 *   Press #1 (Nick, from 6)  Ben 3&2  $10 → Ben +$10
 *   Press #2 (Ben, from 12)  Nick 1up $10 → Nick +$10
 *   ─────────────────────────────────
 *   Net: Ben +$10
 *
 * ── Engine API (shared/nassau-press.ts) ──────────────────────────────────────
 *
 *   segmentsForHole(hole)            → which bets a hole affects
 *   segmentResult(seg, outcomes)     → match state of a main bet
 *   canSidePress(side, seg, ...)     → gate (trailing-side rule, limits)
 *   createPress(...)                 → new PressBet (persisted in gameSettings.pressBets)
 *   pressResult(press, outcomes)     → match state of one press
 *   nassauCard(outcomes, presses, $) → full settlement card incl. every bet line
 *
 * HoleOutcome = {hole, winner: A|B|null} derived from net-stroke winners in
 * holeHistory (handicap-adjusted upstream, same as match play today).
 *
 * ── Migration from the broken press ──────────────────────────────────────────
 *
 * Legacy behavior (DO NOT RESTORE):
 *   - press doubled ONLY the current hole's points, reset next hole
 *   - "Drop (concede)" paid main-bet points and completed the hole with no strokes
 *   - both sides always shown press buttons; PressRules config ignored
 *
 * New behavior: see above. gameConfig.pressRules.{whoCanPress, maxPerHole} is
 * honored by canSidePress().
 */
