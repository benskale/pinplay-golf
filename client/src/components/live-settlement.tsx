import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, DollarSign } from "lucide-react";
import type { Game } from "@shared/schema";
import { getLiveSettlement } from "@/lib/settlement";

interface LiveSettlementProps {
  game: Game;
}

export default function LiveSettlement({ game }: LiveSettlementProps) {
  const { netBalances, transactions, pointValue } = getLiveSettlement(game);

  if (pointValue === 0) return null;

  // Don't show until at least one hole is scored
  const holesPlayed = game.holeHistory?.length ?? 0;
  if (holesPlayed === 0) return null;

  // Check if there's any actual money movement yet
  const hasMovement = transactions.length > 0;

  // Sort players by net balance (highest = most positive = biggest winner)
  const sortedPlayers = [...game.players].sort(
    (a, b) => (netBalances[b] ?? 0) - (netBalances[a] ?? 0)
  );

  return (
    <Card className="border-emerald-200 dark:border-emerald-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
            Live Settlement
          </h3>
          <span className="text-[0.6875rem] text-muted-foreground ml-auto font-medium">
            ${pointValue}/pt
          </span>
        </div>

        {/* Net positions */}
        <div className="space-y-1.5 mb-3">
          {sortedPlayers.map((player) => {
            const amt = netBalances[player] ?? 0;
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
                <span className="text-[0.8125rem] font-medium text-gray-800 dark:text-gray-200">
                  {player.split(" ")[0]}
                </span>
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
              Updates live as holes are scored · ${pointValue}/point
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
