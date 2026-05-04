import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Game } from "@shared/schema";

interface GhinExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
}

function buildScoreText(game: Game, player: string): string {
  const pars = game.pars.length === 18 ? game.pars : Array(18).fill(4);
  const strokes = game.strokes[player] || [];
  const totalPar = pars.reduce((a, b) => a + b, 0);

  const rows: string[] = [];
  rows.push(`Scorecard — ${player}`);
  if (game.courseName) rows.push(`Course: ${game.courseName}`);
  rows.push(`Date: ${new Date(game.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
  rows.push("");

  const holeNums = Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(3));
  const parRow  = pars.map(p => String(p).padStart(3));
  const scoreRow = Array.from({ length: 18 }, (_, i) => {
    const s = strokes[i] || 0;
    return String(s > 0 ? s : "-").padStart(3);
  });

  rows.push("Hole: " + holeNums.join(" "));
  rows.push("Par:  " + parRow.join(" "));
  rows.push("Score:" + scoreRow.join(" "));
  rows.push("");

  const out = strokes.slice(0, 9).reduce((a, b) => a + (b || 0), 0);
  const inn  = strokes.slice(9, 18).reduce((a, b) => a + (b || 0), 0);
  const total = out + inn;
  const diff = total - totalPar;
  const diffStr = diff === 0 ? "Even" : diff > 0 ? `+${diff}` : `${diff}`;

  rows.push(`Out: ${out}   In: ${inn}   Total: ${total} (${diffStr})`);

  return rows.join("\n");
}

export function GhinExportModal({ isOpen, onClose, game }: GhinExportModalProps) {
  const [selectedPlayer, setSelectedPlayer] = useState(game.players[0]);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const pars = game.pars.length === 18 ? game.pars : Array(18).fill(4);
  const totalPar = pars.reduce((a, b) => a + b, 0);
  const front9Par = pars.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9Par  = pars.slice(9).reduce((a, b) => a + b, 0);

  const playerStrokes = game.strokes[selectedPlayer] || [];
  const out   = playerStrokes.slice(0, 9).reduce((a, b) => a + (b || 0), 0);
  const inn   = playerStrokes.slice(9, 18).reduce((a, b) => a + (b || 0), 0);
  const total = out + inn;
  const diff  = total > 0 ? total - totalPar : null;
  const diffStr = diff === null ? "-" : diff === 0 ? "E" : diff > 0 ? `+${diff}` : `${diff}`;

  const completedHoles = game.holeHistory.length;

  const handleCopy = async () => {
    const text = buildScoreText(game, selectedPlayer);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({ title: "Scores copied!", description: "Paste into notes or GHIN." });
    } catch {
      toast({ title: "Couldn't copy automatically", description: "Screenshot this card instead.", variant: "destructive" });
    }
  };

  const cellClass = (strokes: number, par: number) => {
    if (!strokes) return "text-gray-300 dark:text-gray-600";
    const d = strokes - par;
    if (d <= -2) return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded font-bold";
    if (d === -1) return "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded font-semibold";
    if (d === 0)  return "text-gray-600 dark:text-gray-300";
    if (d === 1)  return "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded";
    return "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded font-semibold";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm mx-auto rounded-2xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 flex-shrink-0">
          <DialogTitle className="text-base font-bold">Post to GHIN</DialogTitle>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Use these scores to manually post in the GHIN app
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-4">
          {/* Player selector */}
          {game.players.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {game.players.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPlayer(p)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    selectedPlayer === p
                      ? "bg-primary-700 text-white dark:bg-primary-600"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {p.split(" ")[0]}
                </button>
              ))}
            </div>
          )}

          {/* Score summary card */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 text-white" style={{ background: "linear-gradient(135deg, #0f3520 0%, #155e35 100%)" }}>
              <p className="font-bold text-sm">{selectedPlayer}</p>
              {game.courseName && <p className="text-xs mt-0.5" style={{ color: "rgba(134,196,159,0.9)" }}>{game.courseName}</p>}
              <p className="text-xs mt-0.5" style={{ color: "rgba(134,196,159,0.7)" }}>
                {new Date(game.createdAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                {completedHoles < 18 && ` · ${completedHoles} holes`}
              </p>
            </div>

            {/* Totals bar */}
            <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700 bg-gray-50 dark:bg-gray-800/50 text-center">
              {[
                { label: "Out", val: out, par: front9Par },
                { label: "In",  val: inn, par: back9Par },
                { label: "Total", val: total, par: totalPar, highlight: true },
              ].map(({ label, val, par, highlight }) => (
                <div key={label} className={`py-2 ${highlight ? "bg-white dark:bg-gray-800" : ""}`}>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">{label}</p>
                  <p className={`text-lg font-bold ${val > 0 ? "text-gray-900 dark:text-white" : "text-gray-300 dark:text-gray-600"}`}>
                    {val > 0 ? val : "-"}
                  </p>
                  <p className="text-[10px] text-gray-400">Par {par}</p>
                </div>
              ))}
            </div>

            {/* Hole grid — front 9 */}
            {[
              { label: "Front 9", start: 0, end: 9 },
              { label: "Back 9",  start: 9, end: 18 },
            ].map(({ label, start, end }) => (
              <div key={label} className="border-t border-gray-200 dark:border-gray-700">
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-3 pt-2 pb-1">{label}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-[11px] min-w-[280px]">
                    <thead>
                      <tr className="text-gray-400 dark:text-gray-500">
                        <td className="px-1.5 py-0.5 text-left pl-3 w-10 font-medium">#</td>
                        {Array.from({ length: end - start }, (_, i) => (
                          <td key={i} className="px-0.5 py-0.5 w-7">{start + i + 1}</td>
                        ))}
                      </tr>
                      <tr className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30">
                        <td className="px-1.5 py-0.5 text-left pl-3 font-medium text-[10px]">Par</td>
                        {pars.slice(start, end).map((p, i) => (
                          <td key={i} className="px-0.5 py-0.5 font-medium">{p}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-1.5 py-1 text-left pl-3 font-semibold text-gray-700 dark:text-gray-300 text-[10px]">Score</td>
                        {pars.slice(start, end).map((par, i) => {
                          const s = playerStrokes[start + i] || 0;
                          return (
                            <td key={i} className={`px-0.5 py-1 ${cellClass(s, par)}`}>
                              {s > 0 ? s : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* vs par footer */}
            {total > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 text-center bg-gray-50 dark:bg-gray-800/50">
                <span className={`text-sm font-bold ${diff === 0 ? "text-gray-600 dark:text-gray-300" : diff! < 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                  {diffStr}
                </span>
                <span className="text-xs text-gray-400 ml-1.5">vs par {totalPar}</span>
              </div>
            )}
          </div>

          {/* Copy button */}
          <Button
            onClick={handleCopy}
            className="w-full rounded-xl font-semibold bg-primary-700 hover:bg-primary-800 text-white"
          >
            {copied ? <><Check className="w-4 h-4 mr-2" /> Copied!</> : <><Copy className="w-4 h-4 mr-2" /> Copy Scores</>}
          </Button>

          {/* GHIN instructions */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-2.5">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">How to post in GHIN</p>
            {[
              "Open the GHIN app and sign in",
              `Tap "Post a Score"`,
              game.courseName ? `Search for "${game.courseName}"` : "Search for your course",
              "Enter your scores hole-by-hole using the numbers above",
              "Submit — your Handicap Index will update overnight",
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{step}</p>
              </div>
            ))}

            <a
              href="https://www.ghin.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 font-semibold mt-1 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open GHIN on the web
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
