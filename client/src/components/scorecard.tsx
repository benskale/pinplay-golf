import type { Game } from "@shared/schema";
import { Flag } from "lucide-react";

interface ScorecardProps {
  game: Game;
}

function scoreLabel(strokes: number, par: number) {
  const diff = strokes - par;
  if (strokes === 0) return null;
  if (diff <= -2) return { label: "Eagle", color: "text-yellow-600 dark:text-yellow-400 font-bold" };
  if (diff === -1) return { label: "Birdie", color: "text-green-600 dark:text-green-400 font-semibold" };
  if (diff === 0) return { label: "Par", color: "text-gray-600 dark:text-gray-400" };
  if (diff === 1) return { label: "Bogey", color: "text-orange-500 dark:text-orange-400" };
  if (diff === 2) return { label: "Double", color: "text-red-500 dark:text-red-400" };
  return { label: `+${diff}`, color: "text-red-700 dark:text-red-500 font-bold" };
}

function ScoreCell({ strokes, par }: { strokes: number; par: number }) {
  if (!strokes) return <td className="px-2 py-2 text-center text-[0.625rem] text-gray-300 dark:text-gray-600">-</td>;
  const diff = strokes - par;
  let cellClass = "px-2 py-2 text-center text-[0.6875rem] font-semibold tabular-nums ";
  if (diff <= -2) cellClass += "bg-yellow-100/70 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-md";
  else if (diff === -1) cellClass += "bg-green-100/70 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md";
  else if (diff === 0) cellClass += "text-gray-700 dark:text-gray-300";
  else if (diff === 1) cellClass += "bg-orange-50/70 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-md";
  else cellClass += "bg-red-100/70 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md";

  return <td className={cellClass}>{strokes}</td>;
}

export default function Scorecard({ game }: ScorecardProps) {
  const { players, pars, strokes, holeHistory } = game;
  const holes = pars.length === 18 ? pars : Array(18).fill(4);

  const front9 = holes.slice(0, 9);
  const back9 = holes.slice(9);
  const front9Par = front9.reduce((a, b) => a + b, 0);
  const back9Par = back9.reduce((a, b) => a + b, 0);
  const totalPar = front9Par + back9Par;

  const getPlayerStrokes = (player: string, hole: number) =>
    (strokes[player] && strokes[player][hole - 1]) || 0;

  const getPlayerTotal = (player: string, from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => getPlayerStrokes(player, from + i)).reduce((a, b) => a + b, 0);

  const getScoreVsPar = (total: number, par: number) => {
    if (total === 0) return "-";
    const diff = total - par;
    if (diff === 0) return "E";
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const getScoreVsParColor = (total: number, par: number) => {
    if (total === 0) return "text-gray-400";
    const diff = total - par;
    if (diff < 0) return "text-green-600 dark:text-green-400";
    if (diff === 0) return "text-gray-500 dark:text-gray-400";
    return "text-red-500 dark:text-red-400";
  };

  const completedHoles = holeHistory.length;

  return (
    <div className="space-y-4">
      {game.courseName && (
        <div className="flex items-center space-x-2 px-1">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{game.courseName}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">· Par {totalPar}</span>
        </div>
      )}

      {completedHoles === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-primary-50 dark:bg-primary-950/40 flex items-center justify-center">
            <Flag className="w-8 h-8 text-primary-300 dark:text-primary-600" />
          </div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No holes completed yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Scores appear as you play each hole</p>
        </div>
      )}

      {/* Front 9 */}
      <div>
        <p className="text-[0.625rem] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Front 9</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200/80 dark:border-gray-700/50">
          <table className="w-full text-xs min-w-[500px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 w-20 sticky left-0 bg-inherit z-10"></th>
                {front9.map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-semibold text-gray-500 dark:text-gray-400 w-8 tabular-nums">{i + 1}</th>
                ))}
                <th className="px-3 py-2 text-center font-bold text-gray-600 dark:text-gray-300 text-[0.6875rem]">OUT</th>
              </tr>
              <tr className="bg-gray-50/40 dark:bg-gray-800/30">
                <td className="px-3 py-1 text-[0.625rem] font-medium text-gray-400 dark:text-gray-500 sticky left-0 bg-inherit z-10">Par</td>
                {front9.map((par, i) => (
                  <td key={i} className="px-2 py-1 text-center text-[0.625rem] font-medium text-gray-400 dark:text-gray-500 tabular-nums">{par}</td>
                ))}
                <td className="px-3 py-1 text-center text-[0.625rem] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">{front9Par}</td>
              </tr>
            </thead>
            <tbody>
              {players.map((player, pi) => {
                const out = getPlayerTotal(player, 1, 9);
                const outDiff = out - front9Par;
                return (
                  <tr key={player} className={`border-t border-gray-100 dark:border-gray-800 ${pi % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"}`}>
                    <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 truncate max-w-[80px] text-[0.75rem] sticky left-0 bg-inherit z-10">
                      {player.split(" ")[0]}
                    </td>
                    {front9.map((par, i) => (
                      <ScoreCell key={i} strokes={getPlayerStrokes(player, i + 1)} par={par} />
                    ))}
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {out > 0 ? (
                        <>
                          <span className="text-[0.75rem] font-bold text-gray-800 dark:text-gray-200">{out}</span>
                          <span className={`block text-[0.625rem] font-medium ${getScoreVsParColor(out, front9Par)}`}>{getScoreVsPar(out, front9Par)}</span>
                        </>
                      ) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Back 9 */}
      <div>
        <p className="text-[0.625rem] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 px-1">Back 9</p>
        <div className="overflow-x-auto rounded-xl border border-gray-200/80 dark:border-gray-700/50">
          <table className="w-full text-xs min-w-[500px] border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-gray-800/50">
                <th className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 w-20 sticky left-0 bg-inherit z-10"></th>
                {back9.map((_, i) => (
                  <th key={i} className="px-2 py-2 text-center font-semibold text-gray-500 dark:text-gray-400 w-8 tabular-nums">{i + 10}</th>
                ))}
                <th className="px-3 py-2 text-center font-bold text-gray-600 dark:text-gray-300 text-[0.6875rem]">IN</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 dark:text-gray-200 text-[0.6875rem]">TOT</th>
              </tr>
              <tr className="bg-gray-50/40 dark:bg-gray-800/30">
                <td className="px-3 py-1 text-[0.625rem] font-medium text-gray-400 dark:text-gray-500 sticky left-0 bg-inherit z-10">Par</td>
                {back9.map((par, i) => (
                  <td key={i} className="px-2 py-1 text-center text-[0.625rem] font-medium text-gray-400 dark:text-gray-500 tabular-nums">{par}</td>
                ))}
                <td className="px-3 py-1 text-center text-[0.625rem] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">{back9Par}</td>
                <td className="px-3 py-1 text-center text-[0.625rem] font-semibold text-gray-500 dark:text-gray-400 tabular-nums">{totalPar}</td>
              </tr>
            </thead>
            <tbody>
              {players.map((player, pi) => {
                const inTotal = getPlayerTotal(player, 10, 18);
                const outTotal = getPlayerTotal(player, 1, 9);
                const grandTotal = outTotal + inTotal;
                return (
                  <tr key={player} className={`border-t border-gray-100 dark:border-gray-800 ${pi % 2 === 0 ? "" : "bg-gray-50/40 dark:bg-gray-800/20"}`}>
                    <td className="px-3 py-2.5 font-medium text-gray-800 dark:text-gray-200 truncate max-w-[80px] text-[0.75rem] sticky left-0 bg-inherit z-10">
                      {player.split(" ")[0]}
                    </td>
                    {back9.map((par, i) => (
                      <ScoreCell key={i} strokes={getPlayerStrokes(player, i + 10)} par={par} />
                    ))}
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {inTotal > 0 ? (
                        <>
                          <span className="text-[0.75rem] font-bold text-gray-800 dark:text-gray-200">{inTotal}</span>
                          <span className={`block text-[0.625rem] font-medium ${getScoreVsParColor(inTotal, back9Par)}`}>{getScoreVsPar(inTotal, back9Par)}</span>
                        </>
                      ) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center bg-gray-50/60 dark:bg-gray-800/40 tabular-nums">
                      {grandTotal > 0 ? (
                        <>
                          <span className="text-[0.8125rem] font-extrabold text-gray-900 dark:text-white">{grandTotal}</span>
                          <span className={`block text-[0.625rem] font-semibold ${getScoreVsParColor(grandTotal, totalPar)}`}>{getScoreVsPar(grandTotal, totalPar)}</span>
                        </>
                      ) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend — minimal dots */}
      <div className="flex flex-wrap gap-2 px-1 pt-1">
        {[
          { label: "Eagle", color: "bg-yellow-100/70 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" },
          { label: "Birdie", color: "bg-green-100/70 dark:bg-green-900/30 text-green-700 dark:text-green-300" },
          { label: "Bogey", color: "bg-orange-50/70 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" },
          { label: "Double+", color: "bg-red-100/70 dark:bg-red-900/30 text-red-600 dark:text-red-400" },
        ].map(item => (
          <div key={item.label} className={`text-[0.625rem] px-2 py-0.5 rounded-md font-medium ${item.color}`}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
