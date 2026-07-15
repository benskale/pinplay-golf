import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus, Trash2, Trophy, Swords, Users, Flag, Loader2, X
} from "lucide-react";

interface TournamentMatch {
  id: number;
  tournamentId: string;
  roundId: number | null;
  session: string;
  matchType: string;
  team1Players: string[];
  team2Players: string[];
  gameId: string | null;
  result: {
    team1HolesUp: number;
    team2HolesUp: number;
    status: string;
    holesPlayed: number;
    winner: string | null;
  };
  createdAt: string;
}

interface TournamentPlayer {
  id: number;
  playerName: string;
  userId: number | null;
  avatarUrl: string | null;
}

interface TournamentTeam {
  id: number;
  teamName: string;
  teamColor: string;
}

interface Props {
  tournamentId: string;
  players: TournamentPlayer[];
  teams: TournamentTeam[];
  isCreator: boolean;
}

const SESSION_LABELS: Record<string, string> = {
  fourball_am: "Morning Four-Ball",
  fourball_pm: "Afternoon Four-Ball",
  foursome: "Foursomes (Alternate Shot)",
  singles: "Singles",
};

const MATCH_TYPE_LABELS: Record<string, string> = {
  fourball: "Four-Ball (Best Ball)",
  foursome: "Foursomes (Alternate Shot)",
  singles: "Singles",
};

export function TournamentMatches({ tournamentId, players, teams, isCreator }: Props) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [session, setSession] = useState("singles");
  const [matchType, setMatchType] = useState("singles");
  const [team1Picks, setTeam1Picks] = useState<string[]>([]);
  const [team2Picks, setTeam2Picks] = useState<string[]>([]);

  const { data: matches = [], refetch } = useQuery<TournamentMatch[]>({
    queryKey: ["/api/tournaments", tournamentId, "matches"],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/matches`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: ryderScore } = useQuery<{ team1Points: number; team2Points: number; matches: TournamentMatch[] }>({
    queryKey: ["/api/tournaments", tournamentId, "ryder-cup"],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/ryder-cup`);
      if (!res.ok) return { team1Points: 0, team2Points: 0, matches: [] };
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId, "matches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId, "ryder-cup"] });
    refetch();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/matches`, {
        session,
        matchType,
        team1Players: team1Picks,
        team2Players: team2Picks,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setTeam1Picks([]);
      setTeam2Picks([]);
    },
  });

  const updateResultMutation = useMutation({
    mutationFn: async ({ matchId, winner }: { matchId: number; winner: string }) => {
      const res = await apiRequest("PATCH", `/api/tournaments/${tournamentId}/matches/${matchId}`, {
        result: {
          ...matches.find(m => m.id === matchId)?.result,
          status: "complete",
          winner,
        },
      });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (matchId: number) => {
      await apiRequest("DELETE", `/api/tournaments/${tournamentId}/matches/${matchId}`);
    },
    onSuccess: () => invalidate(),
  });

  const team1 = teams[0];
  const team2 = teams[1];

  // Group matches by session
  const sessions = ["fourball_am", "fourball_pm", "foursome", "singles"];
  const matchesBySession = sessions.map(s => ({
    session: s,
    matches: matches.filter(m => m.session === s),
  })).filter(g => g.matches.length > 0);

  const togglePick = (list: string[], setList: (v: string[]) => void, name: string) => {
    if (list.includes(name)) setList(list.filter(n => n !== name));
    else setList([...list, name]);
  };

  const maxPicks = matchType === "singles" ? 1 : 2;

  return (
    <div className="space-y-4">
      {/* Score Summary */}
      {team1 && team2 && ryderScore && (
        <Card className="border-0 shadow-card bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-gray-800 dark:to-gray-900">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div
                  className="w-3 h-3 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: team1.teamColor || "#3b82f6" }}
                />
                <p className="text-xs text-gray-500 mb-0.5">{team1.teamName}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                  {ryderScore.team1Points}
                </p>
              </div>
              <div className="text-center px-4">
                <Swords className="w-5 h-5 text-gray-400 mx-auto" />
                <p className="text-xs text-gray-400 mt-1">VS</p>
              </div>
              <div className="text-center flex-1">
                <div
                  className="w-3 h-3 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: team2.teamColor || "#ef4444" }}
                />
                <p className="text-xs text-gray-500 mb-0.5">{team2.teamName}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                  {ryderScore.team2Points}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Match Button */}
      {isCreator && !showAdd && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Match
        </Button>
      )}

      {/* Add Match Form */}
      {showAdd && (
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">New Match</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Session</label>
              <select
                value={session}
                onChange={e => {
                  setSession(e.target.value);
                  setMatchType(e.target.value.startsWith("fourball") ? "fourball" : e.target.value === "foursome" ? "foursome" : "singles");
                }}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
              >
                {Object.entries(SESSION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Format</label>
              <select
                value={matchType}
                onChange={e => setMatchType(e.target.value)}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
              >
                {Object.entries(MATCH_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {/* Team 1 picks */}
            {team1 && team2 ? (
              <>
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: team1.teamColor || "#3b82f6" }}>
                    {team1.teamName} (pick {maxPicks})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => team1Picks.length < maxPicks && togglePick(team1Picks, setTeam1Picks, p.playerName)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          team1Picks.includes(p.playerName)
                            ? "bg-primary-600 text-white"
                            : "bg-secondary-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {p.playerName}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: team2.teamColor || "#ef4444" }}>
                    {team2.teamName} (pick {maxPicks})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {players.map(p => (
                      <button
                        key={p.id}
                        onClick={() => team2Picks.length < maxPicks && togglePick(team2Picks, setTeam2Picks, p.playerName)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          team2Picks.includes(p.playerName)
                            ? "bg-red-500 text-white"
                            : "bg-secondary-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {p.playerName}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">Create teams first to set up matches.</p>
            )}

            <Button
              size="sm"
              className="w-full"
              disabled={createMutation.isPending || team1Picks.length === 0 || team2Picks.length === 0}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Match"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Matches grouped by session */}
      {matchesBySession.length === 0 && !showAdd ? (
        <Card className="border-0 shadow-card">
          <CardContent className="p-6 text-center text-sm text-gray-400">
            <Swords className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No matches yet. {isCreator && "Add one to get started."}
          </CardContent>
        </Card>
      ) : (
        matchesBySession.map(({ session: sess, matches: sessMatches }) => (
          <div key={sess}>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              {SESSION_LABELS[sess] || sess}
            </h4>
            <div className="space-y-2">
              {sessMatches.map(match => {
                const r = match.result;
                const isComplete = r?.status === "complete";
                return (
                  <Card key={match.id} className={`border-0 shadow-card ${isComplete ? "opacity-75" : ""}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Team 1 */}
                          <div className="flex items-center gap-1.5">
                            {team1 && (
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team1.teamColor || "#3b82f6" }} />
                            )}
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                              {match.team1Players.join(" / ")}
                            </span>
                            {r?.winner === "team1" && <Trophy className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                          </div>
                          {/* Team 2 */}
                          <div className="flex items-center gap-1.5 mt-1">
                            {team2 && (
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: team2.teamColor || "#ef4444" }} />
                            )}
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                              {match.team2Players.join(" / ")}
                            </span>
                            {r?.winner === "team2" && <Trophy className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                          </div>
                          {r?.winner === "halved" && (
                            <p className="text-xs text-gray-400 mt-1">Halved</p>
                          )}
                        </div>

                        {/* Result / Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {isComplete ? (
                            <span className="text-xs font-bold text-gray-400 px-2">
                              {MATCH_TYPE_LABELS[match.matchType]?.split(" ")[0]}
                            </span>
                          ) : isCreator ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                style={{ color: team1?.teamColor || "#3b82f6" }}
                                onClick={() => updateResultMutation.mutate({ matchId: match.id, winner: "team1" })}
                              >
                                Win
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => updateResultMutation.mutate({ matchId: match.id, winner: "halved" })}
                              >
                                1/2
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                style={{ color: team2?.teamColor || "#ef4444" }}
                                onClick={() => updateResultMutation.mutate({ matchId: match.id, winner: "team2" })}
                              >
                                Win
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-gray-300 hover:text-red-500"
                                onClick={() => deleteMutation.mutate(match.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">Pending</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
