import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { GAME_DEFINITIONS, getGamesForPlayerCount, type GameDef } from "@/lib/game-logic";
import { ArrowLeft, Users, CheckCircle, ChevronRight, Loader2, Trophy } from "lucide-react";

const DEFAULT_PARS = Array(18).fill(4);
const DEFAULT_SI = Array.from({ length: 18 }, (_, i) => i + 1);

interface TournamentPlayer {
  id: number;
  userId: number | null;
  playerName: string;
  isGuest: boolean;
  status: string;
  avatarUrl: string | null;
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
  const availableGames = getGamesForPlayerCount(playerNames.length);

  const togglePlayer = (name: string) => {
    setSelectedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    setSelectedGame(null);
  };

  const createGameMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        gameType: selectedGame!.id,
        players: playerNames,
        courseName: tournament?.courseName || "",
        pars,
        strokeIndexes,
        handicaps: {},
        teams: [] as string[][],
        miniGames: {} as Record<string, any>,
        gameSettings: {} as Record<string, any>,
      };
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/games`, payload);
      return res.json();
    },
    onSuccess: (game) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Round started!", description: `${selectedGame?.name} with ${playerNames.length} players` });
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

        {/* Step 2: Select Game Type */}
        {playerNames.length >= 2 && playerNames.length <= 5 && (
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <h2 className="font-semibold text-foreground">Choose Game Type</h2>
              </div>

              <div className="space-y-2">
                {availableGames.map((game) => (
                  <button
                    key={game.id}
                    onClick={() => setSelectedGame(game)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      selectedGame?.id === game.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{game.name}</p>
                      {game.needsHandicap && (
                        <p className="text-xs text-muted-foreground">Supports handicaps</p>
                      )}
                    </div>
                    {selectedGame?.id === game.id && (
                      <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />
                    )}
                  </button>
                ))}
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
