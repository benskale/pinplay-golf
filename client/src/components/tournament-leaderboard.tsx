import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Loader2, Users, Flame, ArrowUp, ArrowDown, Minus } from "lucide-react";
import type { LeaderboardEntry } from "@shared/schema";

interface TournamentTeam {
  id: number;
  teamName: string;
  teamColor: string;
  memberCount: number;
}

interface TournamentLeaderboardProps {
  tournamentId: string;
  leaderboardData?: LeaderboardEntry[];
  format?: string;
  teams?: TournamentTeam[];
}

export default function TournamentLeaderboard({
  tournamentId,
  leaderboardData,
  format = "stroke_play",
  teams,
}: TournamentLeaderboardProps) {
  const { user } = useAuth();
  const [view, setView] = useState<"team" | "individual">("team");

  const isTeam = format === "best_ball" || format === "scramble";
  const isSkins = format === "skins";
  const isStableford = format === "stableford";
  const isMatchPlay = format === "match_play";
  const isRinger = format === "ringer" || format === "net_ringer";

  // Fetch leaderboard — uses individual endpoint when toggled
  const { data: fetchedLeaderboard = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/tournaments", tournamentId, "leaderboard", view],
    enabled: !!tournamentId && !leaderboardData,
    staleTime: 10_000,
    queryFn: async () => {
      const params = isTeam && view === "individual" ? "?view=individual" : "";
      const res = await fetch(`/api/tournaments/${tournamentId}/leaderboard${params}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const entries = leaderboardData || fetchedLeaderboard;

  // Build a team lookup for color/name enrichment
  const teamLookup = new Map<number, TournamentTeam>();
  if (teams) {
    for (const t of teams) teamLookup.set(t.id, t);
  }

  // For team format individual view, group entries by team
  const showTeamGroups = isTeam && view === "individual" && teams && teams.length > 0;

  // Column layout varies by format
  // Skins:      Pos | Player | Thru | Net | Skins
  // Stableford:  Pos | Player | Thru | Pts  | Quota
  // Match Play:  Pos | Player | Thru | Status
  // Ringer:     Pos | Player | Thru | Holes | Total
  // Team:       Pos | Team   | Thru | Gross | Net
  // Stroke:     Pos | Player | Thru | Gross | Net
  const gridCols = isMatchPlay
    ? "grid-cols-[3rem_1fr_3.5rem_4rem]"
    : "grid-cols-[3rem_1fr_3.5rem_3.5rem_3.5rem]";

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
          Leaderboard will populate as {isTeam ? "teams" : "players"} start their rounds
        </p>
      </div>
    );
  }

  const renderRow = (entry: LeaderboardEntry, index: number, teamColor?: string) => {
    const isCurrentUser = user && entry.userId === user.id;
    const entryTeam = isTeam && !showTeamGroups ? null : null;

    // Phase 5.4: Enhanced live scoring indicators
    const prevPos = entry.previousPosition;
    const moved = prevPos != null ? prevPos - entry.position : 0;
    const onFire = (entry.birdieStreak ?? 0) >= 2;

    return (
      <div
        key={`${entry.playerName}-${entry.gameId || index}`}
        className={`grid ${gridCols} items-center px-3 py-3 text-sm border-t border-gray-100 dark:border-gray-800 ${
          isCurrentUser
            ? "bg-green-50 dark:bg-green-900/20"
            : index % 2 === 1
            ? "bg-gray-50/50 dark:bg-gray-900/20"
            : ""
        }`}
        style={teamColor ? { borderLeftWidth: 4, borderLeftColor: teamColor, paddingLeft: "0.625rem" } : undefined}
      >
        {/* Position with movement indicator (Phase 5.4) */}
        <span className={`font-bold flex items-center gap-0.5 ${
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
          {moved > 0 && <ArrowUp className="w-3 h-3 text-green-500" />}
          {moved < 0 && <ArrowDown className="w-3 h-3 text-red-400" />}
          {moved === 0 && prevPos != null && <Minus className="w-2.5 h-2.5 text-gray-300" />}
        </span>

        {/* Name / Team */}
        <div className="min-w-0">
          <span className={`truncate font-medium flex items-center gap-1.5 ${
            isCurrentUser ? "text-green-700 dark:text-green-300" : "text-gray-900 dark:text-gray-100"
          }`}>
            {isTeam && <Users className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
            <span className="truncate">{entry.playerName}</span>
            {onFire && (
              <span className="flex items-center gap-0.5 text-xs flex-shrink-0" title={`${entry.birdieStreak} under par in a row`}>
                <Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse" style={{ animationDuration: "1.5s" }} />
                {entry.birdieStreak}
              </span>
            )}
            {isCurrentUser && (
              <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-green-200/60 dark:bg-green-800/40 text-green-700 dark:text-green-300 font-semibold uppercase tracking-wide flex-shrink-0">
                You
              </span>
            )}
          </span>
          {isTeam && entry.teamPlayers && entry.teamPlayers.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate block">
              {entry.teamPlayers.join(", ")}
            </span>
          )}
        </div>

        {/* Thru */}
        <span className="text-center text-gray-500 dark:text-gray-400 text-xs">
          {entry.complete ? "F" : entry.holesCompleted > 0 ? `${entry.holesCompleted}` : "-"}
        </span>

        {isStableford ? (
          <>
            <span className="text-center font-bold text-gray-900 dark:text-gray-100">
              {entry.holesCompleted > 0 ? (entry.stablefordPoints ?? 0) : "-"}
            </span>
            <span className="text-center text-gray-500 dark:text-gray-400 text-xs">
              {entry.holesCompleted > 0 ? (entry.quota ?? 0) : "-"}
            </span>
          </>
        ) : isMatchPlay ? (
          <span className="text-center font-bold">
            {entry.holesCompleted > 0 ? (entry.matchStatus ?? "AS") : "-"}
          </span>
        ) : isRinger ? (
          <>
            <span className="text-center font-semibold text-gray-700 dark:text-gray-300">
              {entry.holesCompleted > 0 ? entry.totalStrokes : "-"}
            </span>
            <span className="text-center font-bold text-gray-900 dark:text-gray-100">
              {entry.holesCompleted > 0 ? entry.netStrokes : "-"}
            </span>
          </>
        ) : isSkins ? (
          <>
            <span className="text-center font-semibold text-gray-700 dark:text-gray-300">
              {entry.holesCompleted > 0 ? entry.netStrokes : "-"}
            </span>
            <span className="text-center font-bold text-yellow-600 dark:text-yellow-400">
              {entry.holesCompleted > 0 ? (entry.skinsWon ?? 0) : "-"}
            </span>
          </>
        ) : (
          <>
            <span className="text-center font-semibold text-gray-700 dark:text-gray-300">
              {entry.totalStrokes || "-"}
            </span>
            <span className="text-center font-bold text-gray-900 dark:text-gray-100">
              {entry.holesCompleted > 0 ? entry.netStrokes : "-"}
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toggle for team formats */}
      {isTeam && (
        <div className="flex gap-2">
          <button
            onClick={() => setView("team")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              view === "team"
                ? "bg-[#18181B] text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700"
            }`}
          >
            <Users className="w-3 h-3 inline mr-1" />
            Team Standings
          </button>
          <button
            onClick={() => setView("individual")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${
              view === "individual"
                ? "bg-[#18181B] text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700"
            }`}
          >
            Individual
          </button>
        </div>
      )}

      {/* Leaderboard table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className={`grid ${gridCols} bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider`}>
          <span>Pos</span>
          <span>{(isTeam && view === "team") ? "Team" : "Player"}</span>
          <span className="text-center">Thru</span>
          {isStableford ? (
            <>
              <span className="text-center">Pts</span>
              <span className="text-center">Quota</span>
            </>
          ) : isMatchPlay ? (
            <span className="text-center">Match</span>
          ) : isRinger ? (
            <>
              <span className="text-center">Gross</span>
              <span className="text-center">Ringer</span>
            </>
          ) : isSkins ? (
            <>
              <span className="text-center">Net</span>
              <span className="text-center">Skins</span>
            </>
          ) : (
            <>
              <span className="text-center">Gross</span>
              <span className="text-center">Net</span>
            </>
          )}
        </div>

        {/* Rows */}
        {entries.map((entry, index) => renderRow(entry, index))}
      </div>
    </div>
  );
}
