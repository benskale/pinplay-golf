import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { completeGame } from "@/lib/game-recovery";
import type { Game } from "@shared/schema";

/**
 * Delete button for Active Game cards.
 * Rule: if you started it, you can delete it. The server enforces ownership;
 * this button appears on cards in YOUR active list (games you created, played
 * in, or are tracking locally). Guest-started games (userId null) can be
 * deleted by any player who was in the game when it started (server-side check).
 */
export default function DeleteGameButton({ game }: { game: Game & { active?: boolean } }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const doDelete = async () => {
    setDeleting(true);
    try {
      const res = await apiRequest("DELETE", `/api/games/${game.id}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({ message: "Couldn't delete" }));
        throw new Error(e.message);
      }
      completeGame(game.id); // clear local guest tracking
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/games"] });
      await queryClient.invalidateQueries({ queryKey: ["guest-games"] });
      toast({ title: "Game deleted" });
    } catch (err) {
      toast({
        title: "Couldn't delete game",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        aria-label="Delete game"
        className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl border border-red-200 dark:border-red-900/40 bg-card text-gray-400 hover:text-red-500 hover:border-red-300 transition-colors active:scale-95"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="flex gap-1.5 flex-shrink-0">
      <button
        onClick={doDelete}
        disabled={deleting}
        className="px-3 h-11 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold active:scale-95 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={deleting}
        className="px-3 h-11 rounded-xl bg-card border border-border text-xs font-semibold text-muted-foreground active:scale-95"
      >
        Keep
      </button>
    </div>
  );
}
