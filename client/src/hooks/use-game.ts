import { useCallback } from "react";
import type { Game } from "@shared/schema";

type SendMessage = (message: any) => void;

export function useGame(
  gameId: string | undefined,
  sendMessage: SendMessage,
  game: Game | null | undefined,
) {
  const updateStrokes = useCallback(
    (playerName: string, hole: number, strokes: number) => {
      if (!gameId) return;
      sendMessage({ type: "update_strokes", gameId, playerName, hole, strokes });
    },
    [gameId, sendMessage],
  );

  const completeHole = useCallback(
    (
      holePoints: Record<string, number>,
      holeStrokes: Record<string, number>,
      result: string,
      metadata: Record<string, any>,
    ) => {
      if (!gameId || !game) return;
      sendMessage({
        type: "complete_hole",
        gameId,
        holeData: {
          hole: game.currentHole,
          strokes: holeStrokes,
          points: holePoints,
          result,
          metadata,
        },
      });
    },
    [gameId, sendMessage, game],
  );

  return { updateStrokes, completeHole };
}
