import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { GAME_DEFINITIONS, type GameDef } from "@/lib/game-logic";
import { ArrowLeft, Users, CheckCircle, ChevronRight, Loader2, Trophy } from "lucide-react";

const DEFAULT_PARS = Array(18).fill(4);
const DEFAULT_SI = Array.from({ length: 18 }, (_, i) => i + 1);

const FORMAT_DISPLAY: Record<string, string> = {
  stroke_play: "Stroke Play",
  stableford: "Stableford",
  match_play: "Match Play",
  skins: "Skins",
  best_ball: "Best Ball",
  scramble: "Scramble",
  ryder_cup: "Ryder Cup",
  ringer: "Ringer",
  net_ringer: "Net Ringer",
  custom: "Custom Game",
};

function getGameDefForTournament(format: string, playerCount: number): GameDef | null {
  if (format === "custom") {
    return { id: "custom", name: "Custom Game", description: "Custom tournament format", playerCounts: [2,3,4,5], isTeamGame: false, needsHandicap: false, carryover: false } as GameDef;
  }
  if (GAME_DEFINITIONS[format]) return GAME_DEFINITIONS[format];
  let gameId = format;
  if (format === "skins") gameId = playerCount === 3 ? "skins_3" : playerCount === 4 ? "skins_4" : "skins";
  else if (format === "best_ball") gameId = playerCount <= 2 ? "best_ball_2" : playerCount <= 4 ? "best_ball_4" : "team_best_ball";
  else if (format === "scramble") gameId = playerCount >= 6 ? "team_scramble" : "scramble";
  else if (format === "ryder_cup") gameId = "match_play";
  else if (format === "ringer") gameId = "stroke_play";
  else if (format === "net_ringer") gameId = "stableford";
  return GAME_DEFINITIONS[gameId] || GAME_DEFINITIONS["stroke_play"] || null;
}

interface TournamentPlayer {
  id: number;
  userId: number | null;
  playerName: string;
  isGuest: boolean;
  status: string;
  avatarUrl: string | null;
  teamId: number | null;
}

interface TournamentTeam {
  id: number;
  teamName: string;
  teamColor: string;
  memberCount: number;
}

interface TournamentDetail {
  id: string;
  name: string;
  date: string;
  courseName: string | null;
  courseId: string | null;
  format: string;
  status: string;
  settings: Record<string, any> | null;
  players: TournamentPlayer[];
  teams?: TournamentTeam[];
}

interface CourseDetail {
  id: string;
  name: string;
  pars: number[];
  hcpRanks: number[] | null;
}

export default function TournamentPlayPage() {
  const { id: tournamentId } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [selectedGame, setSelectedGame] = useState<GameDef | null>(null);
  const [pars, setPars] = useState<number[]>([...DEFAULT_PARS]);
  const [strokeIndexes, setStrokeIndexes] = useState<number[]>([...DEFAULT_SI]);

  // Fetch tournament details
  const { data: tournament, isLoading } = useQuery<TournamentDetail>({
    queryKey: ["/api/tournaments", tournamentId],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) throw new Error("Failed to load tournament");
      return res.json();
    },
    staleTime: 15_000,
  });

  // Fetch course details if courseId is set
  const { data: courseData } = useQuery<CourseDetail>({
    queryKey: ["/api/courses", tournament?.courseId],
    enabled: !!tournament?.courseId,
    queryFn: async () => {
      if (!tournament?.courseId) throw new Error("No course");
      const res = await fetch(`/api/courses/${tournament.courseId}`);
      if (!res.ok) throw new Error("Course load failed");
      return res.json();
    },
  });

  // Apply course pars/stroke indexes when data arrives
  useEffect(() => {
    if (courseData?.pars && courseData.pars.length === 18) setPars(courseData.pars);
    if (courseData?.hcpRanks && courseData.hcpRanks.length === 18) setStrokeIndexes(courseData.hcpRanks);
  }, [courseData]);

  // Auto-select the current user
  useEffect(() => {
    if (user && tournament?.players) {
      const me = tournament.players.find(p => p.userId === user.id);
      if (me) {
        setSelectedPlayers(prev => new Set(Array.from(prev).concat(me.playerName)));
      }
    }
  }, [user, tournament?.players]);

  const playerNames = Array.from(selectedPlayers);

  // Auto-select the game type from the tournament's configured format
  useEffect(() => {
    if (tournament?.format && playerNames.length >= 2) {
      const def = getGameDefForTournament(tournament.format, playerNames.length);
      if (def) setSelectedGame(def);
    }
  }, [tournament?.format, playerNames.length]);

  const togglePlayer = (name: string) => {
    setSelectedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const createGameMutation = useMutation({
    mutationFn: async () => {
      const settings = tournament?.settings || {};
      const payload: Record<string, any> = {
        gameType: selectedGame!.id,
        players: playerNames,
        courseName: tournament?.courseName || "",
        pars,
        strokeIndexes,
        handicaps: {},
        teams: [] as string[][],
        miniGames: settings.miniGames || {} as Record<string, any>,
        gameSettings: (() => {
          const gs: Record<string, any> = {};
          if (settings.customGameConfigs?.[0]) gs.customConfig = settings.customGameConfigs[0];
          if (settings.sideGames) gs.sideGames = settings.sideGames;
          return gs;
        })(),
      };
      // For team-format tournaments, pass teamId for team-based game launch
      if (isTeamFormat && myTeamId) {
        payload.teamId = myTeamId;
      }
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/games`, payload);
      return res.json();
    },
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Round started!", description: `${FORMAT_DISPLAY[tournament?.format || ""] || selectedGame?.name || "Tournament"} with ${playerNames.length} players` });
      setLocation(`/game/${game.id}`);
    },
    onError: (error: any) => {
      toast({ title: "Failed to start round", description: error.message || "Please try again", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Tournament not found</p>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  if (tournament.status !== "in_progress") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 px-6">
        <Trophy className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground text-center">
          This tournament hasn't started yet. Ask the host to start it.
        </p>
        <Button onClick={() => setLocation(`/tournament/${tournamentId}`)}>
          Back to Tournament
        </Button>
      </div>
    );
  }

  const registeredPlayers = tournament.players || [];
  const canStart = playerNames.length >= 2 && playerNames.length <= 5 && selectedGame !== null;

  // Team context for team-format tournaments
  const isTeamFormat = tournament.format === "best_ball" || tournament.format === "scramble";
  const myTeamId = user ? registeredPlayers.find(p => p.userId === user.id)?.teamId ?? null : null;
  const myTeam = tournament.teams?.find(t => t.id === myTeamId);
  const myTeamMembers = myTeamId ? registeredPlayers.filter(p => p.teamId === myTeamId) : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="relative" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 40%, #1a3a2a 0%, #0d1f15 50%, #070f0a 100%)" }}>
        <div className="max-w-md mx-auto px-6 pt-8 pb-6">
          <button
            onClick={() => setLocation(`/tournament/${tournamentId}`)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
          <p className="text-sm text-white/60 mt-1">{tournament.courseName}</p>
          <p className="text-xs text-white/40 mt-0.5">Start Your Round</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pb-8 -mt-2 space-y-4">
        {/* Team banner for team-format tournaments */}
        {isTeamFormat && myTeam && (
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: `${myTeam.teamColor}15`, borderLeftWidth: 4, borderLeftColor: myTeam.teamColor }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: myTeam.teamColor }} />
              <span className="font-semibold text-sm" style={{ color: myTeam.teamColor }}>{myTeam.teamName}</span>
              <span className="text-xs text-gray-500 ml-auto">{myTeamMembers.length} players</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {myTeamMembers.map(p => (
                <span
                  key={p.id}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${myTeam.teamColor}20`, color: myTeam.teamColor }}
                >
                  {p.playerName}
                </span>
              ))}
            </div>
            <button
              onClick={() => {
                setSelectedPlayers(new Set(myTeamMembers.map(p => p.playerName)));
                const def = getGameDefForTournament(tournament?.format || "stroke_play", myTeamMembers.length);
                if (def) setSelectedGame(def);
              }}
              className="w-full py-2 text-xs font-semibold rounded-lg text-white transition-colors"
              style={{ backgroundColor: myTeam.teamColor }}
            >
              Start Team Round ({myTeamMembers.length} players)
            </button>
            {myTeamMembers.length < 2 && (
              <p className="text-xs text-red-500 mt-2 text-center">
                Need at least 2 players on your team to start
              </p>
            )}
          </div>
        )}

        {/* Team-format warning: not on a team */}
        {isTeamFormat && !myTeam && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-center">
            <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
              You are not on a team yet
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Go back to the tournament lobby and join or create a team, or manually select players below.
            </p>
            <button
              onClick={() => setLocation(`/tournament/${tournamentId}`)}
              className="mt-3 px-4 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              Go to Lobby
            </button>
          </div>
        )}

        {/* Step 1: Select Players */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                {selectedPlayers.size}
              </div>
              <h2 className="font-semibold text-foreground">Select Your Group</h2>
            </div>

            {registeredPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No players registered yet.</p>
            ) : (
              <div className="space-y-2">
                {registeredPlayers.map((p) => {
                  const isSelected = selectedPlayers.has(p.playerName);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.playerName)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground">
                            {p.playerName.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {p.playerName}
                          {p.isGuest && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(Guest)</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{p.status}</p>
                      </div>
                      {isSelected && (
                        <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 text-center">
              <span className="text-xs text-muted-foreground">
                {selectedPlayers.size} of {registeredPlayers.length} selected
                {selectedPlayers.size < 2 && " (need at least 2)"}
                {selectedPlayers.size > 5 && " (max 5)"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Game Format (locked from tournament setup) */}
        {playerNames.length >= 2 && playerNames.length <= 5 && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Trophy className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Game Format</p>
                  <p className="font-semibold text-foreground">
                    {FORMAT_DISPLAY[tournament?.format || ""] || "Tournament Format"}
                  </p>
                  {tournament?.format === "custom" && tournament?.settings?.customGameConfigs?.[0]?.name ? (
                    <p className="text-xs text-muted-foreground">{tournament.settings.customGameConfigs[0].name}</p>
                  ) : (
                    selectedGame?.description && (
                      <p className="text-xs text-muted-foreground">{selectedGame.description}</p>
                    )
                  )}
                </div>
                <CheckCircle className="w-5 h-5 text-primary ml-auto flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Start Button */}
        <Button
          className="w-full text-base font-semibold py-6"
          disabled={!canStart || createGameMutation.isPending}
          onClick={() => createGameMutation.mutate()}
        >
          {createGameMutation.isPending ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Starting Round...
            </>
          ) : (
            <>
              Start Round <ChevronRight className="w-5 h-5 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
