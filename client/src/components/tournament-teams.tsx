import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface TeamWithCount {
  id: number;
  teamName: string;
  teamColor: string;
  memberCount: number;
}

interface TournamentPlayer {
  id: number;
  playerName: string;
  userId: number | null;
  isGuest: boolean;
  teamId: number | null;
  status: string;
}

interface TournamentTeamsProps {
  tournamentId: string;
  isRegistered: boolean;
  isCreator: boolean;
  currentUser: { id: number; name: string } | null;
  teamSize: number;
  onTeamsChange?: () => void;
}

const TEAM_COLORS = [
  "#E5484D", "#F5680A", "#FFC107", "#3DD68C",
  "#0090FF", "#7B61FF", "#EC4899", "#14B8A6",
  "#6366F1", "#F97316",
];

export function TournamentTeams({
  tournamentId,
  isRegistered,
  isCreator,
  currentUser,
  teamSize,
  onTeamsChange,
}: TournamentTeamsProps) {
  const [teams, setTeams] = useState<TeamWithCount[]>([]);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamColor, setNewTeamColor] = useState(TEAM_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadTeams = useCallback(async () => {
    try {
      const [teamsRes, tournamentRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/teams`),
        fetch(`/api/tournaments/${tournamentId}`),
      ]);
      if (teamsRes.ok) setTeams(await teamsRes.json());
      if (tournamentRes.ok) {
        const data = await tournamentRes.json();
        setPlayers(data.players || []);
      }
    } catch (e) {
      console.error("Failed to load teams:", e);
    }
  }, [tournamentId]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const myTeamId = players.find(p => p.userId === currentUser?.id)?.teamId ?? null;
  const unassignedPlayers = players.filter(p => p.teamId === null);

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName: newTeamName.trim(), teamColor: newTeamColor }),
      });
      if (res.ok) {
        toast({ title: "Team created" });
        setNewTeamName("");
        setShowCreate(false);
        await loadTeams();
        onTeamsChange?.();
      } else {
        const data = await res.json();
        toast({ title: data.message || "Failed to create team", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to create team", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleJoinTeam = async (teamId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}/join`, {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "Joined team" });
        await loadTeams();
        onTeamsChange?.();
      } else {
        const data = await res.json();
        toast({ title: data.message || "Failed to join team", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to join team", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleLeaveTeam = async (teamId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}/leave`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast({ title: "Left team" });
        await loadTeams();
        onTeamsChange?.();
      }
    } catch {
      toast({ title: "Failed to leave team", variant: "destructive" });
    }
    setLoading(false);
  };

  const [assignTeamId, setAssignTeamId] = useState<number | null>(null);
  const [addNameTeamId, setAddNameTeamId] = useState<number | null>(null);
  const [newTeamPlayerName, setNewTeamPlayerName] = useState("");
  const [showAutoSplit, setShowAutoSplit] = useState(false);
  const [splitSize, setSplitSize] = useState(teamSize || 4);

  const handleAutoSplit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/auto-split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamSize: splitSize }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: data.message });
        setShowAutoSplit(false);
        await loadTeams();
        onTeamsChange?.();
      } else {
        const data = await res.json();
        toast({ title: data.message || "Failed to split teams", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to split teams", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleAssignPlayer = async (teamId: number, playerName: string) => {
    setLoading(true);
    setAssignTeamId(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName }),
      });
      if (res.ok) {
        toast({ title: `${playerName} added to team` });
        await loadTeams();
        onTeamsChange?.();
      } else {
        const data = await res.json();
        toast({ title: data.message || "Failed to add", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to add player", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleAddPlayerByName = async (teamId: number) => {
    const name = newTeamPlayerName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerName: name }),
      });
      if (res.ok) {
        toast({ title: `${name} added to team` });
        setNewTeamPlayerName("");
        setAddNameTeamId(null);
        await loadTeams();
        onTeamsChange?.();
      } else {
        const data = await res.json();
        toast({ title: data.message || "Failed to add", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to add player", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleRemovePlayer = async (playerName: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/0/players/${encodeURIComponent(playerName)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast({ title: `${playerName} removed from team` });
        await loadTeams();
        onTeamsChange?.();
      } else {
        const data = await res.json();
        toast({ title: data.message || "Failed to remove", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to remove player", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleDeleteTeam = async (teamId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast({ title: "Team deleted" });
        await loadTeams();
        onTeamsChange?.();
      }
    } catch {
      toast({ title: "Failed to delete team", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleUpdateTeam = async (teamId: number, teamName: string, teamColor: string) => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName, teamColor }),
      });
      if (res.ok) {
        toast({ title: "Team updated" });
        await loadTeams();
        onTeamsChange?.();
      }
    } catch {
      toast({ title: "Failed to update team", variant: "destructive" });
    }
  };

  const getTeamMembers = (teamId: number) =>
    players.filter(p => p.teamId === teamId).map(p => p.playerName);

  if (!isRegistered && !isCreator) {
    return (
      <div className="text-center py-8 text-[#71717A] text-sm">
        Join the tournament to participate in teams.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[#18181B]">Teams</h3>
          <p className="text-xs text-[#71717A] mt-0.5">
            Max {teamSize} players per team
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCreator && (
            <button
              onClick={() => setShowAutoSplit(!showAutoSplit)}
              disabled={loading}
              className="px-3 py-1.5 text-sm font-medium border border-[#18181B] text-[#18181B] rounded-lg hover:bg-[#F4F4F5] disabled:opacity-50 transition-colors"
            >
              {showAutoSplit ? "Cancel" : "Auto-Split"}
            </button>
          )}
          <button
            onClick={() => setShowCreate(!showCreate)}
            disabled={loading}
            className="px-3 py-1.5 text-sm font-medium bg-[#18181B] text-white rounded-lg hover:bg-[#27272A] disabled:opacity-50 transition-colors"
          >
            {showCreate ? "Cancel" : "Create Team"}
          </button>
        </div>
      </div>

      {/* Auto-split form */}
      {showAutoSplit && (
        <div className="bg-[#F4F4F5] rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs text-[#71717A] mb-2">Split all {players.length} players into teams of:</p>
            <div className="flex items-center gap-2">
              {[2, 3, 4, 5].map(size => (
                <button
                  key={size}
                  onClick={() => setSplitSize(size)}
                  className={`w-10 h-10 rounded-lg font-semibold text-sm transition-all ${splitSize === size ? "bg-[#18181B] text-white" : "bg-white border border-[#E4E4E7] text-[#71717A] hover:border-[#18181B]"}`}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#A1A1AA] mt-1.5">
              Creates {Math.ceil(players.filter(p => true).length / splitSize)} teams. This replaces all existing teams.
            </p>
          </div>
          <button
            onClick={handleAutoSplit}
            disabled={loading || players.length < 2}
            className="w-full py-2 text-sm font-medium bg-[#3DD68C] text-white rounded-lg hover:bg-[#2DBF78] disabled:opacity-50 transition-colors"
          >
            Split into Teams
          </button>
        </div>
      )}

      {/* Create team form */}
      {showCreate && (
        <div className="bg-[#F4F4F5] rounded-xl p-4 space-y-3">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name (e.g. Team Eagles)"
            maxLength={100}
            className="w-full px-3 py-2 bg-white border border-[#E4E4E7] rounded-lg text-sm outline-none focus:border-[#18181B]"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717A] mr-1">Color:</span>
            {TEAM_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewTeamColor(color)}
                className={`w-7 h-7 rounded-full transition-transform ${newTeamColor === color ? "ring-2 ring-offset-2 ring-[#18181B] scale-110" : "hover:scale-110"}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <button
            onClick={handleCreateTeam}
            disabled={loading || !newTeamName.trim()}
            className="w-full py-2 text-sm font-medium bg-[#3DD68C] text-white rounded-lg hover:bg-[#2DBF78] disabled:opacity-50 transition-colors"
          >
            Create Team
          </button>
        </div>
      )}

      {/* Teams list */}
      {teams.length === 0 ? (
        <div className="text-center py-8 text-[#71717A] text-sm">
          No teams yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team) => {
            const members = getTeamMembers(team.id);
            const isMyTeam = myTeamId === team.id;
            const isFull = team.memberCount >= teamSize;

            return (
              <div
                key={team.id}
                className="bg-white border border-[#E4E4E7] rounded-xl p-3"
                style={{ borderLeftWidth: 4, borderLeftColor: team.teamColor }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: team.teamColor }}
                    />
                    <span className="font-semibold text-sm text-[#18181B]">{team.teamName}</span>
                    {isFull && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-[#F4F4F5] text-[#71717A] rounded-full font-medium uppercase tracking-wide">
                        Full
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[#71717A]">
                    {team.memberCount}/{teamSize}
                  </span>
                </div>

                {/* Members */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {members.length > 0 ? (
                    members.map(name => (
                      <span
                        key={name}
                        className="text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1"
                        style={{
                          backgroundColor: `${team.teamColor}20`,
                          color: team.teamColor,
                        }}
                      >
                        {name}
                        {isCreator && (
                          <button
                            onClick={() => handleRemovePlayer(name)}
                            disabled={loading}
                            className="ml-0.5 opacity-60 hover:opacity-100 disabled:opacity-30"
                            title={`Remove ${name}`}
                          >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                          </button>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-[#A1A1AA]">No members yet</span>
                  )}
                </div>

                {/* Creator: Add player — dropdown of existing + text input for new */}
                {isCreator && !isFull && (
                  <div className="mb-2 space-y-2">
                    {unassignedPlayers.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setAssignTeamId(assignTeamId === team.id ? null : team.id)}
                          disabled={loading}
                          className="text-xs px-3 py-1 border border-dashed border-[#D4D4D8] text-[#71717A] rounded-lg hover:border-[#18181B] hover:text-[#18181B] disabled:opacity-50 transition-colors font-medium w-full"
                        >
                          + Add from Roster
                        </button>
                        {assignTeamId === team.id && (
                          <div className="absolute z-20 mt-1 w-full bg-white border border-[#E4E4E7] rounded-lg shadow-lg overflow-hidden">
                            {unassignedPlayers.map(p => (
                              <button
                                key={p.id}
                                onClick={() => handleAssignPlayer(team.id, p.playerName)}
                                disabled={loading}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-[#F4F4F5] transition-colors font-medium text-[#18181B]"
                              >
                                {p.playerName}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      {addNameTeamId === team.id ? (
                        <>
                          <input
                            type="text"
                            value={newTeamPlayerName}
                            onChange={(e) => setNewTeamPlayerName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleAddPlayerByName(team.id); }}
                            placeholder="Type a name..."
                            autoFocus
                            maxLength={50}
                            className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-[#E4E4E7] rounded-lg outline-none focus:border-[#18181B]"
                          />
                          <button
                            onClick={() => handleAddPlayerByName(team.id)}
                            disabled={loading || !newTeamPlayerName.trim()}
                            className="px-2.5 py-1.5 text-xs font-medium bg-[#3DD68C] text-white rounded-lg hover:bg-[#2DBF78] disabled:opacity-50 transition-colors"
                          >
                            Add
                          </button>
                          <button
                            onClick={() => { setAddNameTeamId(null); setNewTeamPlayerName(""); }}
                            className="px-2 py-1.5 text-xs text-[#71717A] rounded-lg hover:bg-[#F4F4F5]"
                          >
                            X
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => { setAddNameTeamId(team.id); setNewTeamPlayerName(""); }}
                          disabled={loading}
                          className="text-xs px-3 py-1 border border-dashed border-[#D4D4D8] text-[#71717A] rounded-lg hover:border-[#18181B] hover:text-[#18181B] disabled:opacity-50 transition-colors font-medium w-full"
                        >
                          + Add by Name
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  {!isMyTeam && !isFull ? (
                    <button
                      onClick={() => handleJoinTeam(team.id)}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-[#18181B] text-white rounded-lg hover:bg-[#27272A] disabled:opacity-50 transition-colors font-medium"
                    >
                      Join Team
                    </button>
                  ) : isMyTeam ? (
                    <button
                      onClick={() => handleLeaveTeam(team.id)}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-[#F4F4F5] text-[#71717A] rounded-lg hover:bg-[#E4E4E7] disabled:opacity-50 transition-colors font-medium"
                    >
                      Leave Team
                    </button>
                  ) : null}
                  {isCreator && (
                    <button
                      onClick={() => handleDeleteTeam(team.id)}
                      disabled={loading}
                      className="text-xs px-3 py-1 text-[#E5484D] hover:bg-[#E5484D] hover:text-white rounded-lg disabled:opacity-50 transition-colors font-medium ml-auto"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned players */}
      {unassignedPlayers.length > 0 && (
        <div className="pt-2">
          <p className="text-xs text-[#A1A1AA] mb-1.5">
            {isCreator ? "Tap Add Player on a team to assign:" : "Not on a team:"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unassignedPlayers.map(p => (
              <span
                key={p.id}
                className="text-xs px-2 py-0.5 bg-[#F4F4F5] text-[#71717A] rounded-full font-medium"
              >
                {p.playerName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
