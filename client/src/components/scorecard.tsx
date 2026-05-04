import type { Game } from "@shared/schema";

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
  if (!strokes) return <td className="border border-gray-300 dark:border-gray-600 px-1 py-1.5 text-center text-xs text-gray-400">-</td>;
  const diff = strokes - par;
  let cellClass = "border border-gray-300 dark:border-gray-600 px-1 py-1.5 text-center text-xs font-semibold ";
  if (diff <= -2) cellClass += "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300";
  else if (diff === -1) cellClass += "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300";
  else if (diff === 0) cellClass += "text-gray-700 dark:text-gray-300";
  else if (diff === 1) cellClass += "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400";
  else cellClass += "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400";

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
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          Scores will appear here as holes are completed. Enter strokes while playing each hole.
        </p>
      )}

      {/* Front 9 */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 px-1">Front 9</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-300 w-20">Player</th>
                {front9.map((_, i) => (
                  <th key={i} className="border border-gray-300 dark:border-gray-600 px-1 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300 w-8">{i + 1}</th>
                ))}
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300">Out</th>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">Par</td>
                {front9.map((par, i) => (
                  <td key={i} className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400">{par}</td>
                ))}
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">{front9Par}</td>
              </tr>
            </thead>
            <tbody>
              {players.map((player, pi) => {
                const out = getPlayerTotal(player, 1, 9);
                return (
                  <tr key={player} className={pi % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/30"}>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 font-medium text-gray-800 dark:text-gray-200 truncate max-w-[80px]">
                      {player.split(" ")[0]}
                    </td>
                    {front9.map((par, i) => (
                      <ScoreCell key={i} strokes={getPlayerStrokes(player, i + 1)} par={par} />
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center font-bold text-gray-800 dark:text-gray-200">
                      {out > 0 ? (
                        <span>
                          {out}
                          <span className="block text-xs font-normal text-gray-500">{getScoreVsPar(out, front9Par)}</span>
                        </span>
                      ) : "-"}
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
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 px-1">Back 9</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-left font-semibold text-gray-600 dark:text-gray-300 w-20">Player</th>
                {back9.map((_, i) => (
                  <th key={i} className="border border-gray-300 dark:border-gray-600 px-1 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300 w-8">{i + 10}</th>
                ))}
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300">In</th>
                <th className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center font-semibold text-gray-600 dark:text-gray-300">Tot</th>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/50">
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">Par</td>
                {back9.map((par, i) => (
                  <td key={i} className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400">{par}</td>
                ))}
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">{back9Par}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-2 py-1 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">{totalPar}</td>
              </tr>
            </thead>
            <tbody>
              {players.map((player, pi) => {
                const inTotal = getPlayerTotal(player, 10, 18);
                const outTotal = getPlayerTotal(player, 1, 9);
                const grandTotal = outTotal + inTotal;
                return (
                  <tr key={player} className={pi % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800/30"}>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 font-medium text-gray-800 dark:text-gray-200 truncate max-w-[80px]">
                      {player.split(" ")[0]}
                    </td>
                    {back9.map((par, i) => (
                      <ScoreCell key={i} strokes={getPlayerStrokes(player, i + 10)} par={par} />
                    ))}
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center font-bold text-gray-800 dark:text-gray-200">
                      {inTotal > 0 ? (
                        <span>
                          {inTotal}
                          <span className="block text-xs font-normal text-gray-500">{getScoreVsPar(inTotal, back9Par)}</span>
                        </span>
                      ) : "-"}
                    </td>
                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800">
                      {grandTotal > 0 ? (
                        <span>
                          {grandTotal}
                          <span className="block text-xs font-normal text-gray-500">{getScoreVsPar(grandTotal, totalPar)}</span>
                        </span>
                      ) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1 pt-1">
        {[
          { label: "Eagle", color: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300" },
          { label: "Birdie", color: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" },
          { label: "Par", color: "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700" },
          { label: "Bogey", color: "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400" },
          { label: "Double+", color: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400" },
        ].map(item => (
          <div key={item.label} className={`text-xs px-2 py-0.5 rounded ${item.color}`}>{item.label}</div>
        ))}
      </div>
    </div>
  );
}
