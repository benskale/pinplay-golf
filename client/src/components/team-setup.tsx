/**
 * Multi-Team Setup Component
 *
 * Replaces the hardcoded A/B team toggle with a flexible team assignment UI
  * that supports 2+ teams for groups of any size.
 *
 * Features:
 * - Choose number of teams (auto-suggested based on player count)
 * - Auto-distribute players evenly
 * - Manual assignment by tapping to cycle through teams
 * - Snake-draft auto-balance (optional, by handicap)
 * - Custom team names
 */

import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Shuffle, Users, RefreshCw } from "lucide-react";

interface TeamSetupProps {
  players: string[];
  handicaps?: Record<string, number>;
  defaultNumTeams?: number;
  onTeamsChange: (teams: string[][], teamNames: string[]) => void;
}

const TEAM_COLORS = [
  { border: "border-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", name: "Team Alpha" },
  { border: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500", name: "Team Bravo" },
  { border: "border-green-500", bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300", dot: "bg-green-500", name: "Team Charlie" },
  { border: "border-purple-500", bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", name: "Team Delta" },
  { border: "border-pink-500", bg: "bg-pink-50 dark:bg-pink-950/30", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500", name: "Team Echo" },
  { border: "border-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500", name: "Team Foxtrot" },
  { border: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/30", text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500", name: "Team Golf" },
  { border: "border-red-500", bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500", name: "Team Hotel" },
];

function suggestNumTeams(playerCount: number): number {
  if (playerCount <= 4) return 2;
  if (playerCount <= 6) return 2;
  if (playerCount <= 9) return 3;
  if (playerCount <= 12) return 3;
  if (playerCount <= 16) return 4;
  return Math.min(5, Math.floor(playerCount / 4));
}

export default function TeamSetup({ players, handicaps = {}, defaultNumTeams, onTeamsChange }: TeamSetupProps) {
  const validPlayers = players.filter(p => p.trim() !== "");
  const suggestedTeams = defaultNumTeams || suggestNumTeams(validPlayers.length);

  const [numTeams, setNumTeams] = useState(suggestedTeams);
  const [assignment, setAssignment] = useState<Record<string, number>>({});
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [autoBalanced, setAutoBalanced] = useState(false);

  // Initialize team names from defaults
  useEffect(() => {
    setTeamNames(prev => {
      const next = TEAM_COLORS.slice(0, numTeams).map((c, i) => prev[i] || c.name);
      return next;
    });
  }, [numTeams]);

  // Auto-assign players to teams on init or when player count/numTeams changes
  useEffect(() => {
    if (validPlayers.length === 0) return;
    const next: Record<string, number> = {};
    validPlayers.forEach((p, i) => {
      // Snake distribution: 0,1,2,...,n-1,n-1,n-2,...,1,0,0,1,...
      const cycle = 2 * (numTeams - 1);
      const posInCycle = i % cycle;
      next[p] = posInCycle < numTeams ? posInCycle : cycle - posInCycle;
    });
    setAssignment(next);
    setAutoBalanced(false);
  }, [numTeams, validPlayers.join(",")]);

  // Notify parent whenever teams change
  useEffect(() => {
    const teams: string[][] = Array.from({ length: numTeams }, () => []);
    validPlayers.forEach(p => {
      const tIdx = assignment[p] ?? 0;
      if (teams[tIdx]) teams[tIdx].push(p);
    });
    onTeamsChange(teams, teamNames.slice(0, numTeams));
  }, [assignment, numTeams, teamNames, validPlayers.join(",")]);

  const handleTapPlayer = (player: string) => {
    const current = assignment[player] ?? 0;
    const next = (current + 1) % numTeams;
    setAssignment(prev => ({ ...prev, [player]: next }));
  };

  const handleAutoBalance = () => {
    // Snake draft by handicap (best to worst alternating)
    const sorted = [...validPlayers].sort((a, b) => {
      const hcpA = handicaps[a] ?? 0;
      const hcpB = handicaps[b] ?? 0;
      return hcpA - hcpB; // lowest handicap first
    });
    const next: Record<string, number> = {};
    sorted.forEach((p, i) => {
      const cycle = 2 * (numTeams - 1);
      const posInCycle = i % cycle;
      next[p] = posInCycle < numTeams ? posInCycle : cycle - posInCycle;
    });
    setAssignment(next);
    setAutoBalanced(true);
  };

  const handleShuffle = () => {
    const shuffled = [...validPlayers];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const next: Record<string, number> = {};
    shuffled.forEach((p, i) => {
      const cycle = 2 * (numTeams - 1);
      const posInCycle = i % cycle;
      next[p] = posInCycle < numTeams ? posInCycle : cycle - posInCycle;
    });
    setAssignment(next);
    setAutoBalanced(false);
  };

  const maxTeams = Math.min(Math.max(8, validPlayers.length), Math.max(2, validPlayers.length));
  const minTeams = 2;
  const teamCounts = Array.from({ length: maxTeams - minTeams + 1 }, (_, i) => minTeams + i);

  // Build team rosters for display
  const teamRosters = useMemo(() => {
    const rosters: { name: string; players: string[] }[] = [];
    for (let t = 0; t < numTeams; t++) {
      const roster = validPlayers.filter(p => (assignment[p] ?? 0) === t);
      rosters.push({ name: teamNames[t] || TEAM_COLORS[t].name, players: roster });
    }
    return rosters;
  }, [assignment, numTeams, teamNames, validPlayers.join(",")]);

  return (
    <div className="space-y-4">
      {/* Team count selector */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Number of Teams</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {teamCounts.map(n => (
            <button
              key={n}
              className={`px-4 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                numTeams === n
                  ? "border-primary-600 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300"
                  : "border-gray-200 dark:border-gray-700 text-muted-foreground hover:border-gray-300 dark:hover:border-gray-600"
              }`}
              onClick={() => setNumTeams(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          onClick={handleShuffle}
        >
          <Shuffle className="w-3.5 h-3.5" />
          Random
        </button>
        {Object.keys(handicaps).length > 0 && validPlayers.some(p => (handicaps[p] ?? 0) > 0) && (
          <button
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              autoBalanced
                ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                : "border-gray-200 dark:border-gray-700 text-muted-foreground hover:bg-gray-50 dark:hover:bg-gray-800/50"
            }`}
            onClick={handleAutoBalance}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Balance by Handicap
          </button>
        )}
      </div>

      {/* Team rosters preview */}
      <div className="space-y-2">
        {teamRosters.map((roster, t) => {
          const color = TEAM_COLORS[t];
          return (
            <div key={t} className={`rounded-lg border-2 ${color.border} ${color.bg} p-3`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
                <Input
                  type="text"
                  value={teamNames[t] || color.name}
                  onChange={e => setTeamNames(prev => {
                    const next = [...prev];
                    next[t] = e.target.value;
                    return next;
                  })}
                  className={`h-7 text-sm font-bold border-0 bg-transparent px-0 ${color.text} focus-visible:ring-0`}
                />
                <span className={`text-xs ${color.text} opacity-60 ml-auto`}>{roster.players.length} player{roster.players.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {roster.players.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">No players assigned</span>
                ) : (
                  roster.players.map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded bg-white/60 dark:bg-black/20 font-medium">
                      {p.split(" ")[0]}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-player assignment (tap to cycle) */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Tap a player's badge to cycle through teams:</p>
        <div className="flex flex-wrap gap-2">
          {validPlayers.map(player => {
            const tIdx = assignment[player] ?? 0;
            const color = TEAM_COLORS[tIdx];
            return (
              <button
                key={player}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-colors ${color.border} ${color.bg} ${color.text}`}
                onClick={() => handleTapPlayer(player)}
              >
                <div className={`w-2 h-2 rounded-full ${color.dot}`} />
                {player.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
