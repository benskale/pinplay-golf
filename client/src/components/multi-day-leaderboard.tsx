import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, ChevronDown, ChevronUp, Flame, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LeaderboardEntry } from "@shared/schema";

interface TournamentRound {
  id: number;
  name: string;
  roundNumber: number;
  format: string;
}

interface MultiDayData {
  leaderboard: LeaderboardEntry[];
  rounds: TournamentRound[];
}

interface Props {
  tournamentId: string;
}

export function MultiDayLeaderboard({ tournamentId }: Props) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<MultiDayData>({
    queryKey: ["/api/tournaments", tournamentId, "multi-day-leaderboard"],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/multi-day-leaderboard`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 10_000,
  });

  if (isLoading) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-6 text-center text-sm text-gray-400">
          Loading multi-day leaderboard...
        </CardContent>
      </Card>
    );
  }

  if (!data || data.rounds.length <= 1) {
    return null; // Only show for multi-round tournaments
  }

  const { leaderboard, rounds } = data;

  if (leaderboard.length === 0) {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-6 text-center text-sm text-gray-400">
          No scores posted yet across rounds.
        </CardContent>
      </Card>
    );
  }

  // Column widths based on number of rounds
  const roundCols = rounds.length;

  return (
    <Card className="border-0 shadow-card">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-500" />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              Multi-Day Leaderboard
            </h4>
            <span className="text-xs text-gray-400">
              {roundCols} round{roundCols !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary-500 hover:text-primary-600 flex items-center gap-1"
          >
            {expanded ? "Compact" : "Details"}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Table header */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left p-2 pl-3 font-medium w-8">#</th>
                <th className="text-left p-2 font-medium">Player</th>
                {expanded && rounds.map(r => (
                  <th key={r.id} className="text-center p-2 font-medium whitespace-nowrap">
                    {r.name || `R${r.roundNumber}`}
                  </th>
                ))}
                <th className="text-center p-2 font-medium">Total</th>
                <th className="text-center p-2 font-medium pr-3">Thru</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => {
                const prevPos = entry.previousPosition;
                const moved = prevPos ? prevPos - entry.position : 0;
                return (
                  <tr
                    key={entry.playerName}
                    className="border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                  >
                    <td className="p-2 pl-3">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-gray-400 w-4">{entry.position}</span>
                        {moved > 0 && <TrendingUp className="w-3 h-3 text-green-500" />}
                        {moved < 0 && <TrendingDown className="w-3 h-3 text-red-500" />}
                        {moved === 0 && prevPos && <Minus className="w-3 h-3 text-gray-300" />}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        {entry.avatarUrl && (
                          <img src={entry.avatarUrl} className="w-5 h-5 rounded-full" alt="" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-gray-50 text-xs">
                          {entry.playerName}
                        </span>
                        {entry.birdieStreak && entry.birdieStreak >= 2 && (
                          <Flame className="w-3 h-3 text-orange-500" />
                        )}
                      </div>
                    </td>
                    {expanded && rounds.map(r => {
                      const roundScore = entry.roundScores?.[String(r.id)];
                      return (
                        <td key={r.id} className="text-center p-2 text-xs text-gray-600 dark:text-gray-300">
                          {roundScore != null ? roundScore : "-"}
                        </td>
                      );
                    })}
                    <td className="text-center p-2 font-bold text-gray-900 dark:text-gray-50">
                      {entry.totalThroughRounds ?? entry.totalStrokes}
                    </td>
                    <td className="text-center p-2 text-xs text-gray-400 pr-3">
                      R{entry.thruRound || 1}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
