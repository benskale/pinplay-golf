/**
 * Press call UI + state management for the correct Nassau press engine.
 * Drop-in hook for active-game.tsx. Replaces the broken per-hole multiplier.
 */
import { useState, useMemo, useCallback } from "react";
import type { Game } from "@shared/schema";
import {
  PressBet, HoleOutcome, canSidePress, outcomesFromHistory,
  segmentsForHole, nassauCard,
} from "@shared/nassau-press";
export { getPressSides } from "../lib/game-logic";

export interface PressState {
  presses: PressBet[];
  pendingCall: { side: "A" | "B"; segment: "front" | "back" | "overall" } | null;
  callPress: (side: "A" | "B", segment?: "front" | "back" | "overall") => void;
  confirmCall: () => void;
  cancelCall: () => void;
  canPress: (side: "A" | "B", segment: "front" | "back" | "overall") => { ok: boolean; reason?: string };
  card: ReturnType<typeof nassauCard>;
  outcomes: HoleOutcome[];
}

export function usePressEngine(game: Game, unitValue: number): PressState {
  // persisted in gameSettings so presses survive reloads / multi-device
  const presses: PressBet[] = useMemo(
    () => (game.gameSettings?.pressBets as PressBet[] | undefined) ?? [],
    [game.gameSettings],
  );

  const outcomes = useMemo(() => outcomesFromHistory(game.holeHistory), [game.holeHistory]);
  const [pendingCall, setPendingCall] = useState<PressState["pendingCall"]>(null);

  const canPress = useCallback(
    (side: "A" | "B", segment: "front" | "back" | "overall") =>
      canSidePress(side, segment, outcomes, game.currentHole, "losing_only", presses),
    [outcomes, game.currentHole, presses],
  );

  const callPress = useCallback(
    (side: "A" | "B", segment?: "front" | "back" | "overall") => {
      const seg = segment ?? segmentsForHole(game.currentHole)[0];
      const check = canSidePress(side, seg, outcomes, game.currentHole, "losing_only", presses);
      if (!check.ok) return; // UI should disable the button anyway
      setPendingCall({ side, segment: seg });
    },
    [game.currentHole, outcomes, presses],
  );

  const confirmCall = useCallback(() => {
    // actual persistence happens in the caller (WS message); this hook exposes
    // the confirmed call for the component to send.
    setPendingCall(null);
  }, []);

  const cancelCall = useCallback(() => setPendingCall(null), []);

  const card = useMemo(() => nassauCard(outcomes, presses, unitValue), [outcomes, presses, unitValue]);

  return { presses, pendingCall, callPress, confirmCall, cancelCall, canPress, card, outcomes };
}

