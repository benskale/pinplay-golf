import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Loader2 } from "lucide-react";
import type { LeaderboardEntry } from "@shared/schema";

interface TournamentLeaderboardProps {
  tournamentId: string;
  leaderboardData?: LeaderboardEntry[];
}

export default function TournamentLeaderboard({ tournamentId, leaderboardData }: TournamentLeaderboardProps) {
  const { user } = useAuth();

  // Fetch leaderboard if not provided via props (from WebSocket)
  const { data: fetchedLeaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/tournaments", tournamentId, "leaderboard"],
    enabled: !!tournamentId && !leaderboardData,
    staleTime: 10_000,
  });

  const entries = leaderboardData || fetchedLeaderboard;

  if (isLoading && !leaderboardData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No scores yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Leaderboard will populate as players start their rounds
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="grid grid-cols-[3rem_1fr_3.5rem_3.5rem_3.5rem] bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
        <span>Pos</span>
        <span>Player</span>
        <span className="text-center">Thru</span>
        <span className="text-center">Gross</span>
        <span className="text-center">Net</span>
      </div>

      {/* Rows */}
      {entries.map((entry, index) => {
        const isCurrentUser = user && entry.userId === user.id;

        return (
          <div
            key={`${entry.playerName}-${entry.gameId || index}`}
            className={`grid grid-cols-[3rem_1fr_3.5rem_3.5rem_3.5rem] items-center px-3 py-3 text-sm border-t border-gray-100 dark:border-gray-800 ${
              isCurrentUser
                ? "bg-green-50 dark:bg-green-900/20"
                : index % 2 === 1
                ? "bg-gray-50/50 dark:bg-gray-900/20"
                : ""
            }`}
          >
            {/* Position */}
            <span className={`font-bold ${
              entry.position === 1 ? "text-yellow-600" :
              entry.position === 2 ? "text-gray-400" :
              entry.position === 3 ? "text-amber-600" :
              "text-gray-600 dark:text-gray-400"
            }`}>
              {entry.complete ? `${entry.position}` : `${entry.position} `}
              {entry.position <= 3 && entry.complete && (
                <span className="text-xs">
                  {entry.position === 1 ? "🥇" : entry.position === 2 ? "🥈" : "🥉"}
                </span>
              )}
            </span>

            {/* Player name */}
            <span className={`truncate font-medium ${
              isCurrentUser ? "text-green-700 dark:text-green-300" : "text-gray-900 dark:text-gray-100"
            }`}>
              {entry.playerName}
              {isCurrentUser && (
                <span className="text-[0.625rem] ml-1.5 px-1.5 py-0.5 rounded-full bg-green-200/60 dark:bg-green-800/40 text-green-700 dark:text-green-300 font-semibold uppercase tracking-wide">
                  You
                </span>
              )}
            </span>

            {/* Thru */}
            <span className="text-center text-gray-500 dark:text-gray-400 text-xs">
              {entry.complete ? "F" : entry.holesCompleted > 0 ? `${entry.holesCompleted}` : "-"}
            </span>

            {/* Gross */}
            <span className="text-center font-semibold text-gray-700 dark:text-gray-300">
              {entry.totalStrokes || "-"}
            </span>

            {/* Net */}
            <span className="text-center font-bold text-gray-900 dark:text-gray-100">
              {entry.holesCompleted > 0 ? entry.netStrokes : "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
