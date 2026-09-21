import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, TrendingUp } from "lucide-react";
import type { SkinsHoleDetail, HoleDetail } from "@shared/schema";

interface TournamentHoleDetailProps {
  tournamentId: string;
  /** WS leaderboard payload — identity change triggers a live refetch */
  refreshKey?: unknown;
}

export default function TournamentHoleDetail({ tournamentId, refreshKey }: TournamentHoleDetailProps) {
  const { data } = useQuery<SkinsHoleDetail>({
    queryKey: ["/api/tournaments", tournamentId, "hole-detail", refreshKey],
    enabled: !!tournamentId,
    staleTime: 5_000,
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/hole-detail`);
      if (!res.ok) return { format: "", players: [], holes: [] };
      return res.json();
    },
  });

  if (!data || data.format !== "skins") return null;

  const holes = data.holes;
  if (holes.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
              Hole by Hole
            </h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Skins log appears once groups start posting scores.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Player order: skins won desc, then fewest strokes
  const playerRows = [...data.players].sort((a, b) => b.skinsWon - a.skinsWon);
  const maxHole = Math.max(...holes.map(h => h.hole));

  // score lookup: player -> hole -> result
  const cell = (playerName: string, hole: number) => {
    const h = holes.find(x => x.hole === hole);
    if (!h) return null;
    return h.results.find(r => r.playerName === playerName) ?? null;
  };

  const firstName = (name: string) => name.split(" ")[0];

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
            Hole by Hole
          </h3>
          <span className="text-[0.6875rem] text-muted-foreground ml-auto font-medium">
            swipe to scroll →
          </span>
        </div>
        <p className="text-[0.6875rem] text-gray-400 dark:text-gray-500 mb-3">
          green = skin won · ● = handicap stroke · ➔ halved, carries
        </p>

        <div className="overflow-x-auto -mx-1 px-1">
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card dark:bg-card px-2 py-1.5 text-left text-[0.6875rem] font-semibold text-gray-500 dark:text-gray-400 min-w-[76px]">
                  Player
                </th>
                {Array.from({ length: maxHole }, (_, i) => i + 1).map(holeNum => {
                  const h = holes.find(x => x.hole === holeNum);
                  const halved = h && h.winner === null;
                  return (
                    <th key={holeNum} className="px-0 py-1.5 w-8 min-w-[32px]">
                      <div className="flex flex-col items-center leading-none gap-0.5">
                        <span className="font-semibold text-gray-600 dark:text-gray-300">{holeNum}</span>
                        {halved && <span className="text-[0.625rem] text-gray-400">➔</span>}
                        {h?.carryoverIn ? (
                          !halved && <span className="text-[0.5625rem] text-amber-500 font-bold">+{h.carryoverIn}</span>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
                <th className="px-2 py-1.5 text-center text-[0.6875rem] font-semibold text-amber-600 dark:text-amber-400 min-w-[44px]">
                  Skins
                </th>
              </tr>
            </thead>
            <tbody>
              {playerRows.map(p => (
                <tr key={p.playerName}>
                  <td className="sticky left-0 z-10 bg-card dark:bg-card px-2 py-1.5 text-[0.75rem] font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-100 dark:border-gray-800">
                    {firstName(p.playerName)}
                  </td>
                  {Array.from({ length: maxHole }, (_, i) => i + 1).map(holeNum => {
                    const r = cell(p.playerName, holeNum);
                    if (!r) {
                      return (
                        <td key={holeNum} className="px-0 py-1.5 text-center text-gray-300 dark:text-gray-700">
                          –
                        </td>
                      );
                    }
                    const won = holes.find(x => x.hole === holeNum)?.winner === p.playerName;
                    return (
                      <td key={holeNum} className="px-0 py-1.5">
                        <div
                          className={`w-8 min-w-[32px] h-8 mx-0.5 rounded-lg flex items-center justify-center tabular-nums ${
                            won
                              ? "bg-emerald-500 text-white font-bold shadow-sm"
                              : r.net < r.gross
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium"
                                : "text-gray-500 dark:text-gray-400"
                          }`}
                          title={`${p.playerName} · hole ${holeNum} · gross ${r.gross}${r.strokesReceived ? ` · ${r.strokesReceived} stroke${r.strokesReceived > 1 ? "s" : ""} received` : ""} · net ${r.net}`}
                        >
                          {r.gross}
                          {r.strokesReceived > 0 && !won && (
                            <span className="text-[0.5rem] ml-px opacity-70">●</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center">
                    <span className="inline-flex items-center justify-center min-w-[36px] h-8 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[0.8125rem] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      {p.skinsWon}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Skins log */}
        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-gray-400" />
            <p className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wide">
              Skins Log
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {holes.map((h: HoleDetail) =>
              h.winner ? (
                <span
                  key={h.hole}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-[0.6875rem] font-medium text-emerald-700 dark:text-emerald-400"
                >
                  <span className="text-emerald-500 font-bold">{h.hole}</span>
                  {firstName(h.winner)}
                  <span className="text-emerald-600/70 dark:text-emerald-500/70">net {h.results.find(r => r.playerName === h.winner)?.net}</span>
                  {h.skinsAwarded > 1 && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">×{h.skinsAwarded}</span>
                  )}
                </span>
              ) : (
                <span
                  key={h.hole}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-[0.6875rem] font-medium text-gray-500 dark:text-gray-400"
                >
                  <span className="font-bold">{h.hole}</span>
                  halved{h.carryoverOut > 0 ? ` · ${h.carryoverOut} carried` : ""}
                </span>
              )
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
