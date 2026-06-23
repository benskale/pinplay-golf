import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, DollarSign, Sparkles } from "lucide-react";
import type { Game } from "@shared/schema";
import { getLiveSettlement } from "@/lib/settlement";
import { MINI_GAME_DEFINITIONS } from "@/lib/game-logic";

interface LiveSettlementProps {
  game: Game;
}

export default function LiveSettlement({ game }: LiveSettlementProps) {
  const {
    netBalances,
    mainGameBalances,
    miniGameBalances,
    miniGameTotals,
    transactions,
    pointValue,
    hasMainGame,
    hasMiniGames,
  } = getLiveSettlement(game);

  // Don't render if nothing to show
  if (!hasMainGame && !hasMiniGames) return null;

  // Don't show until at least one hole is scored
  const holesPlayed = game.holeHistory?.length ?? 0;
  if (holesPlayed === 0) return null;

  const hasMovement = transactions.length > 0;

  const sortedPlayers = [...game.players].sort(
    (a, b) => (netBalances[b] ?? 0) - (netBalances[a] ?? 0)
  );

  // Which side games have dollar values AND data?
  const activeMiniGameIds = game.miniGames && typeof game.miniGames === "object"
    ? Object.entries(game.miniGames)
        .filter(([, v]) => v.enabled && v.value > 0)
        .map(([id]) => id)
    : [];

  const showMiniGameBreakdown = hasMiniGames && activeMiniGameIds.some(
    (id) => miniGameTotals[id] && Object.values(miniGameTotals[id]).some((v) => v > 0)
  );

  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
            Live Settlement
          </h3>
          {hasMainGame && (
            <span className="text-[0.6875rem] text-muted-foreground ml-auto font-medium">
              ${pointValue}/pt
            </span>
          )}
        </div>

        {/* Net positions (combined) */}
        <div className="space-y-1.5 mb-3">
          {sortedPlayers.map((player) => {
            const amt = netBalances[player] ?? 0;
            const main = mainGameBalances[player] ?? 0;
            const side = miniGameBalances[player] ?? 0;
            const hasSplit = hasMainGame && hasMiniGames && Math.abs(main - amt) > 0.01;

            return (
              <div
                key={player}
                className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                  amt > 0
                    ? "bg-green-50 dark:bg-green-950/30"
                    : amt < 0
                      ? "bg-red-50 dark:bg-red-950/20"
                      : "bg-gray-50 dark:bg-gray-800/50"
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[0.8125rem] font-medium text-gray-800 dark:text-gray-200">
                    {player.split(" ")[0]}
                  </span>
                  {hasSplit && (
                    <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                      {main !== 0 && `${main > 0 ? "+" : ""}$${Math.round(main)} game`}
                      {main !== 0 && side !== 0 && " · "}
                      {side !== 0 && `${side > 0 ? "+" : ""}$${Math.round(side)} sides`}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[0.9375rem] font-bold tabular-nums ${
                    amt > 0
                      ? "text-green-600 dark:text-green-400"
                      : amt < 0
                        ? "text-red-500"
                        : "text-gray-400"
                  }`}
                >
                  {amt > 0 ? "+" : ""}
                  {amt < 0 ? "-" : ""}
                  ${Math.abs(Math.round(amt))}
                </span>
              </div>
            );
          })}
        </div>

        {/* Mini-game breakdown */}
        {showMiniGameBreakdown && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mb-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-primary-500" />
              <p className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wide">
                Side Games
              </p>
            </div>
            <div className="space-y-1.5">
              {activeMiniGameIds.map((id) => {
                const def = MINI_GAME_DEFINITIONS[id];
                if (!def) return null;
                const totals = miniGameTotals[id];
                if (!totals) return null;
                const value = game.miniGames?.[id]?.value || 0;
                const hasData = Object.values(totals).some((v) => v > 0);
                if (!hasData) return null;

                return (
                  <div key={id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <span className="text-[0.6875rem] font-medium text-muted-foreground min-w-[70px]">
                      {def.name}
                    </span>
                    <div className="flex-1 flex items-center gap-1.5">
                      {game.players.map((p) => {
                        const count = totals[p] || 0;
                        const sideBal = miniGameBalances[p] || 0;
                        // Approximate this game's contribution (proportional)
                        return (
                          <span key={p} className={`text-[0.6875rem] tabular-nums font-medium ${
                            count > 0 ? "text-gray-700 dark:text-gray-300" : "text-gray-300 dark:text-gray-600"
                          }`}>
                            {p.split(" ")[0]} {count > 0 && <span className="text-primary-600 dark:text-primary-400">({count})</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pairwise transactions */}
        {hasMovement ? (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Who Owes Whom
              </p>
              <div className="space-y-1.5">
                {transactions.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex items-center gap-2 text-[0.8125rem]">
                      <span className="font-medium text-red-500 dark:text-red-400">
                        {t.from.split(" ")[0]}
                      </span>
                      <ArrowRight className="w-3 h-3 text-gray-400" />
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {t.to.split(" ")[0]}
                      </span>
                    </div>
                    <span className="text-[0.9375rem] font-bold tabular-nums text-gray-700 dark:text-gray-300">
                      ${t.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[0.625rem] text-muted-foreground mt-2 text-center">
              {hasMainGame && hasMiniGames
                ? `Includes main game (${pointValue > 0 ? `$${pointValue}/pt` : ""}) + side games`
                : hasMainGame
                  ? `Updates live as holes are scored · $${pointValue}/point`
                  : "Side games only · updates as holes are scored"}
            </p>
          </>
        ) : (
          <p className="text-[0.75rem] text-center text-muted-foreground py-1">
            No money movement yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
