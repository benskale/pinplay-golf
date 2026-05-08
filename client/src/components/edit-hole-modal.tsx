import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import type { Game } from "@shared/schema";

interface EditHoleModalProps {
  game: Game;
  holeNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (holeNumber: number, newStrokes: Record<string, number>) => void;
}

export default function EditHoleModal({ game, holeNumber, open, onOpenChange, onSave }: EditHoleModalProps) {
  const holeEntry = game.holeHistory.find(h => h.hole === holeNumber);
  const par = game.pars[holeNumber - 1] || 4;

  const [editStrokes, setEditStrokes] = useState<Record<string, number>>(() => {
    if (!holeEntry) return {};
    const init: Record<string, number> = {};
    for (const p of game.players) {
      init[p] = holeEntry.strokes[p] || 0;
    }
    return init;
  });

  const handleSave = () => {
    // Check all players have strokes
    const missing = game.players.filter(p => !editStrokes[p] || editStrokes[p] < 1);
    if (missing.length > 0) return;
    onSave(holeNumber, editStrokes);
    onOpenChange(false);
  };

  const adjustStrokes = (player: string, delta: number) => {
    setEditStrokes(prev => ({
      ...prev,
      [player]: Math.max(1, (prev[player] || par) + delta),
    }));
  };

  const getScoreLabel = (strokes: number) => {
    const diff = strokes - par;
    if (diff <= -2) return { label: "Eagle", cls: "text-yellow-600 font-bold" };
    if (diff === -1) return { label: "Birdie", cls: "text-green-600 font-semibold" };
    if (diff === 0) return { label: "Par", cls: "text-gray-500" };
    if (diff === 1) return { label: "Bogey", cls: "text-orange-500" };
    if (diff === 2) return { label: "Double", cls: "text-red-500" };
    return { label: `+${diff}`, cls: "text-red-600 font-bold" };
  };

  if (!holeEntry) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Edit Hole {holeNumber}
          </DialogTitle>
          <p className="text-sm text-gray-500 mt-1">
            Par {par} · {game.courseName || "No course"}
          </p>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {game.players.map(player => {
            const strokes = editStrokes[player] || par;
            const scoreLabel = getScoreLabel(strokes);
            return (
              <div key={player} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium truncate max-w-[100px]">
                  {player.split(" ")[0]}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-8 h-8 p-0 text-lg font-bold"
                    onClick={() => adjustStrokes(player, -1)}
                  >
                    −
                  </Button>
                  <div className="w-10 text-center">
                    <span className="text-lg font-bold tabular-nums">{strokes}</span>
                    <span className={`block text-[0.625rem] ${scoreLabel.cls}`}>
                      {scoreLabel.label}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-8 h-8 p-0 text-lg font-bold"
                    onClick={() => adjustStrokes(player, 1)}
                  >
                    +
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
