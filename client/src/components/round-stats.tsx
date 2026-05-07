import { Card, CardContent } from "@/components/ui/card";
import type { Game } from "@shared/schema";

interface RoundStatsProps {
  game: Game;
}

/** Categorize every completed hole for a player relative to par. */
function getScoringBreakdown(game: Game) {
  const pars = game.pars.length === 18 ? game.pars : Array(18).fill(4);
  const breakdown: Record<string, {
    eagles: number; birdies: number; pars: number; bogeys: number; doubleBogeys: number;
    totalStrokes: number; holesPlayed: number; bestHole: number; worstHole: number;
    frontNine: number; backNine: number; total: number;
  }> = {};

  for (const player of game.players) {
    const b = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0, totalStrokes: 0, holesPlayed: 0, bestHole: 999, worstHole: 0, frontNine: 0, backNine: 0, total: 0 };
    const playerStrokes = game.strokes[player] || [];

    for (let i = 0; i < 18; i++) {
      const s = playerStrokes[i];
      if (!s) continue;
      const par = pars[i];
      const diff = s - par;
      b.holesPlayed++;
      b.totalStrokes += s;
      if (i < 9) b.frontNine += s;
      else b.backNine += s;
      b.total += s;
      if (s < b.bestHole) b.bestHole = s;
      if (s > b.worstHole) b.worstHole = s;

      if (diff <= -2) b.eagles++;
      else if (diff === -1) b.birdies++;
      else if (diff === 0) b.pars++;
      else if (diff === 1) b.bogeys++;
      else b.doubleBogeys++;
    }

    breakdown[player] = b;
  }

  return breakdown;
}

export default function RoundStats({ game }: RoundStatsProps) {
  const stats = getScoringBreakdown(game);
  const pars = game.pars.length === 18 ? game.pars : Array(18).fill(4);
  const totalPar = pars.reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Round Stats</h3>
        <div className="space-y-5">
          {game.players.map(player => {
            const s = stats[player];
            if (!s || s.holesPlayed === 0) return null;
            const vsPar = s.total - (totalPar * s.holesPlayed / 18);
            const vsParStr = vsPar === 0 ? "E" : vsPar > 0 ? `+${Math.round(vsPar * 10) / 10}` : `${Math.round(vsPar * 10) / 10}`;

            return (
              <div key={player} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{player}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{s.total}</span>
                    <span className={`text-sm font-semibold tabular-nums ${vsPar < 0 ? "text-green-600 dark:text-green-400" : vsPar === 0 ? "text-gray-500" : "text-red-500 dark:text-red-400"}`}>
                      ({vsParStr})
                    </span>
                  </div>
                </div>

                {/* Scoring breakdown bar */}
                <div className="flex items-center gap-1 h-6 rounded-lg overflow-hidden">
                  {s.eagles > 0 && (
                    <div className="bg-yellow-400 dark:bg-yellow-600 h-full flex items-center justify-center" style={{ width: `${(s.eagles / s.holesPlayed) * 100}%`, minWidth: 24 }}>
                      <span className="text-[0.625rem] font-bold text-yellow-900">{s.eagles}</span>
                    </div>
                  )}
                  {s.birdies > 0 && (
                    <div className="bg-green-400 dark:bg-green-600 h-full flex items-center justify-center" style={{ width: `${(s.birdies / s.holesPlayed) * 100}%`, minWidth: 24 }}>
                      <span className="text-[0.625rem] font-bold text-green-900">{s.birdies}</span>
                    </div>
                  )}
                  {s.pars > 0 && (
                    <div className="bg-gray-300 dark:bg-gray-600 h-full flex items-center justify-center" style={{ width: `${(s.pars / s.holesPlayed) * 100}%`, minWidth: 24 }}>
                      <span className="text-[0.625rem] font-bold text-gray-700 dark:text-gray-200">{s.pars}</span>
                    </div>
                  )}
                  {s.bogeys > 0 && (
                    <div className="bg-orange-300 dark:bg-orange-600 h-full flex items-center justify-center" style={{ width: `${(s.bogeys / s.holesPlayed) * 100}%`, minWidth: 24 }}>
                      <span className="text-[0.625rem] font-bold text-orange-900">{s.bogeys}</span>
                    </div>
                  )}
                  {s.doubleBogeys > 0 && (
                    <div className="bg-red-300 dark:bg-red-600 h-full flex items-center justify-center" style={{ width: `${(s.doubleBogeys / s.holesPlayed) * 100}%`, minWidth: 24 }}>
                      <span className="text-[0.625rem] font-bold text-red-900">{s.doubleBogeys}</span>
                    </div>
                  )}
                </div>

                {/* Legend row */}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {s.eagles > 0 && <span className="text-[0.625rem] font-medium text-yellow-600 dark:text-yellow-400">🦅 Eagle{s.eagles > 1 ? "s" : ""}</span>}
                  {s.birdies > 0 && <span className="text-[0.625rem] font-medium text-green-600 dark:text-green-400">🐦 Birdie{s.birdies > 1 ? "s" : ""}</span>}
                  {s.pars > 0 && <span className="text-[0.625rem] font-medium text-gray-500">Par{s.pars > 1 ? "s" : ""}</span>}
                  {s.bogeys > 0 && <span className="text-[0.625rem] font-medium text-orange-500">Bogey{s.bogeys > 1 ? "s" : ""}</span>}
                  {s.doubleBogeys > 0 && <span className="text-[0.625rem] font-medium text-red-500">Double{s.doubleBogeys > 1 ? "s" : ""}</span>}
                </div>

                {/* Quick stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                      {s.frontNine > 0 ? s.frontNine : "—"}
                    </p>
                    <p className="text-[0.625rem] text-gray-400">Front 9</p>
                  </div>
                  <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                      {s.backNine > 0 ? s.backNine : "—"}
                    </p>
                    <p className="text-[0.625rem] text-gray-400">Back 9</p>
                  </div>
                  <div className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <p className="text-xs font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                      {s.bestHole < 999 ? s.bestHole : "—"}
                    </p>
                    <p className="text-[0.625rem] text-gray-400">Best Hole</p>
                  </div>
                </div>

                {/* Divider between players (not last) */}
                {player !== game.players[game.players.length - 1] && (
                  <div className="border-t border-gray-100 dark:border-gray-800" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
