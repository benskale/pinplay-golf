import { UserCircle, Play, CheckCircle } from "lucide-react";
import type { TournamentPlayer } from "@shared/schema";

interface TournamentPlayerListProps {
  players: (TournamentPlayer & { avatarUrl: string | null })[];
  currentUserId?: number | null;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Play }> = {
  registered: { label: "Registered", color: "text-gray-500 dark:text-gray-400", icon: UserCircle },
  playing: { label: "Playing", color: "text-green-500 dark:text-green-400", icon: Play },
  complete: { label: "Finished", color: "text-blue-500 dark:text-blue-400", icon: CheckCircle },
  dnf: { label: "DNF", color: "text-red-500 dark:text-red-400", icon: UserCircle },
};

export default function TournamentPlayerList({ players, currentUserId }: TournamentPlayerListProps) {
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
              </div>
              <div className={`flex items-center gap-1.5 mt-0.5 text-xs ${status.color}`}>
                <StatusIcon className="w-3 h-3" />
                <span>{status.label}</span>
              </div>
            </div>

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
