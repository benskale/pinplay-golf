import { UserCircle, Play, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import type { TournamentPlayer, TournamentTeam } from "@shared/schema";

interface TournamentPlayerListProps {
  players: (TournamentPlayer & { avatarUrl: string | null })[];
  currentUserId?: number | null;
  teams?: TournamentTeam[];
  isCreator?: boolean;
  tournamentId?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Play }> = {
  registered: { label: "Registered", color: "text-gray-500 dark:text-gray-400", icon: UserCircle },
  playing: { label: "Playing", color: "text-green-500 dark:text-green-400", icon: Play },
  finished: { label: "Finished", color: "text-blue-500 dark:text-blue-400", icon: CheckCircle },
  complete: { label: "Finished", color: "text-blue-500 dark:text-blue-400", icon: CheckCircle },
  dnf: { label: "DNF", color: "text-red-500 dark:text-red-400", icon: UserCircle },
};

export default function TournamentPlayerList({ players, currentUserId, teams, isCreator, tournamentId }: TournamentPlayerListProps) {
  const queryClient = useQueryClient();
  const [editingHcp, setEditingHcp] = useState<string | null>(null);

  const saveHandicap = async (playerName: string, value: string) => {
    setEditingHcp(null);
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 54)) return;
    const rounded = parsed === null ? null : Math.round(parsed);
    const player = players.find(p => p.playerName === playerName);
    if (!player || player.handicap === rounded) return;
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/players/handicap`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ playerName, handicap: rounded }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      }
    } catch {
      // silent — list re-renders from server truth on next fetch
    }
  };
  if (players.length === 0) {
    return (
      <div className="text-center py-12">
        <UserCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">No players yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Share the invite link to get players to join
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {players.map((player, index) => {
        const status = statusConfig[player.status] || statusConfig.registered;
        const StatusIcon = status.icon;
        const isCurrentUser = currentUserId && player.userId === currentUserId;
        const team = teams?.find(t => t.id === player.teamId);

        return (
          <div
            key={player.id}
            className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
              isCurrentUser
                ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40"
                : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
            }`}
          >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {player.avatarUrl && !player.avatarUrl.startsWith("data:") ? (
                <img src={player.avatarUrl} className="w-10 h-10 rounded-full object-cover" alt="" />
              ) : (
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {player.playerName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`font-medium text-sm truncate ${
                  isCurrentUser ? "text-green-700 dark:text-green-300" : "text-gray-900 dark:text-gray-100"
                }`}>
                  {player.playerName}
                </p>
                {isCurrentUser && (
                  <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-green-200/60 dark:bg-green-800/40 text-green-700 dark:text-green-300 font-semibold uppercase tracking-wide">
                    You
                  </span>
                )}
                {player.isGuest && (
                  <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide">
                    Guest
                  </span>
                )}
              </div>
              <div className={`flex items-center gap-1.5 mt-0.5 text-xs ${status.color}`}>
                <StatusIcon className="w-3 h-3" />
                <span>{status.label}</span>
                {team && (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold"
                    style={{ backgroundColor: `${team.teamColor}20`, color: team.teamColor }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: team.teamColor }} />
                    {team.teamName}
                  </span>
                )}
              </div>
            </div>

            {/* Handicap — editable by creator or the player themself */}
            {(isCreator || isCurrentUser) && tournamentId ? (
              editingHcp === player.playerName ? (
                <Input
                  type="number"
                  min={0}
                  max={54}
                  autoFocus
                  defaultValue={player.handicap ?? ""}
                  onBlur={(e) => saveHandicap(player.playerName, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  className="w-16 h-8 text-center text-sm"
                  placeholder="—"
                />
              ) : (
                <button
                  onClick={() => setEditingHcp(player.playerName)}
                  className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold tabular-nums hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                  title="Set handicap index"
                >
                  {player.handicap != null ? `Hcp ${player.handicap}` : "+ Hcp"}
                </button>
              )
            ) : player.handicap != null ? (
              <span className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-semibold tabular-nums flex-shrink-0">
                Hcp {player.handicap}
              </span>
            ) : null}

            {/* Position number */}
            <span className="text-xs font-bold text-gray-300 dark:text-gray-600">
              #{index + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}
