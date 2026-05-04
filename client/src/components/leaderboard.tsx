import { Card, CardContent } from "@/components/ui/card";
import type { Game } from "@shared/schema";

interface LeaderboardProps {
  game: Game;
}

export function Leaderboard({ game }: LeaderboardProps) {
  const sortedPlayers = [...game.players].sort((a, b) => {
    const scoreA = game.totalScores[a] || 0;
    const scoreB = game.totalScores[b] || 0;
    return scoreB - scoreA; // Descending order
  });

  const getRankColor = (index: number) => {
    switch (index) {
      case 0:
        return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
      case 1:
        return "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700";
      case 2:
        return "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800";
      default:
        return "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700";
    }
  };

  const getRankBadgeColor = (index: number) => {
    switch (index) {
      case 0:
        return "bg-yellow-400 text-white";
      case 1:
        return "bg-gray-400 text-white";
      case 2:
        return "bg-orange-400 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  const getScoreColor = (index: number) => {
    switch (index) {
      case 0:
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4" data-testid="text-leaderboard-title">
          Leaderboard
        </h3>
        
        <div className="space-y-3">
          {sortedPlayers.map((player, index) => (
            <div
              key={player}
              className={`flex items-center justify-between p-3 border rounded-lg ${getRankColor(index)}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getRankBadgeColor(index)}`}>
                  <span className="text-sm font-bold" data-testid={`text-rank-${index + 1}`}>
                    {index + 1}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-200" data-testid={`text-leaderboard-player-${player}`}>
                    {player}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400" data-testid={`text-wolf-count-${player}`}>
                    Wolf: {game.wolfCounts[player] || 0} times
                  </p>
                </div>
              </div>
              <span className={`text-xl font-bold ${getScoreColor(index)}`} data-testid={`text-total-score-${player}`}>
                {game.totalScores[player] || 0}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
