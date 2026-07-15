import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Trophy, Users, Share2, Copy, Play, XCircle,
  Loader2, Calendar, MapPin, Gamepad2, ExternalLink,
  Crown, CheckCircle, Clock, UserPlus, Flag
} from "lucide-react";
import type { Tournament, TournamentPlayer, Game, LeaderboardEntry, WSMessage } from "@shared/schema";
import TournamentLeaderboard from "@/components/tournament-leaderboard";
import TournamentPlayerList from "@/components/tournament-player-list";
import { TournamentTeams } from "@/components/tournament-teams";

interface TournamentTeam {
  id: number;
  teamName: string;
  teamColor: string;
  memberCount: number;
}

interface TournamentDetail extends Tournament {
  players: (TournamentPlayer & { avatarUrl: string | null })[];
  games: Game[];
  teams?: TournamentTeam[];
  creator: { id: number; name: string; avatarUrl: string | null } | null;
  isRegistered: boolean;
  isCreator: boolean;
  playerCount: number;
}

export default function TournamentPage() {
  const { id: tournamentId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("players");
  const [copiedLink, setCopiedLink] = useState(false);
  const [wsLeaderboard, setWsLeaderboard] = useState<LeaderboardEntry[] | undefined>(undefined);
  const [guestName, setGuestName] = useState("");
  const [newPlayerName, setNewPlayerName] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  // Fetch tournament data
  const { data: tournament, isLoading, error } = useQuery<TournamentDetail>({
    queryKey: ["/api/tournaments", tournamentId],
    enabled: !!tournamentId,
    staleTime: 15_000,
  });

  // Connect to tournament WebSocket channel
  useEffect(() => {
    if (!tournamentId) return;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        ws.send(JSON.stringify({
          type: "join_tournament",
          tournamentId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "tournament_updated") {
            queryClient.setQueryData(
              ["/api/tournaments", tournamentId],
              (old: TournamentDetail | undefined) => {
                if (!old) return old;
                return {
                  ...old,
                  ...message.tournament,
                  players: message.tournament.players || old.players,
                };
              }
            );
          }
          if (message.type === "tournament_score_update") {
            setWsLeaderboard(message.leaderboard);
          }
        } catch (e) {
          console.error("[WS Tournament] parse error:", e);
        }
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (event.code === 1000 || event.code === 1001) return;

        const attempt = attemptRef.current;
        if (attempt >= 10) return;

        const delay = Math.min(500 * Math.pow(2, attempt) + Math.random() * 500, 15_000);
        attemptRef.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {};
    };

    attemptRef.current = 0;
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "component unmount");
        wsRef.current = null;
      }
    };
  }, [tournamentId, queryClient]);

  // Join tournament mutation
  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/join`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tournaments"] });
      toast({ title: "Joined tournament!" });
    },
    onError: (err: Error) => toast({ title: "Failed to join", description: err.message, variant: "destructive" }),
  });

  // Leave tournament mutation
  const leaveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/tournaments/${tournamentId}/leave`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tournaments"] });
      toast({ title: "Left tournament" });
    },
    onError: (err: Error) => toast({ title: "Failed to leave", description: err.message, variant: "destructive" }),
  });

  // Start tournament mutation (creator only)
  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/start`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Tournament started!" });
    },
    onError: (err: Error) => toast({ title: "Failed to start", description: err.message, variant: "destructive" }),
  });

  // Cancel tournament mutation (creator only)
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/tournaments/${tournamentId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Tournament cancelled" });
    },
    onError: (err: Error) => toast({ title: "Failed to cancel", description: err.message, variant: "destructive" }),
  });

  // Complete tournament mutation (creator only)
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/complete`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Tournament complete!", description: "Final results are locked in." });
    },
    onError: (err: Error) => toast({ title: "Failed to complete", description: err.message, variant: "destructive" }),
  });

  // Guest join mutation (no auth)
  const guestJoinMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/join-guest`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Joined tournament!", description: "You joined as a guest." });
    },
    onError: (err: Error) => toast({ title: "Failed to join", description: err.message, variant: "destructive" }),
  });

  // Add player mutation (creator only)
  const addPlayerMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/players`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] });
      toast({ title: "Player added!" });
      setNewPlayerName("");
      setShowAddPlayer(false);
    },
    onError: (err: Error) => toast({ title: "Failed to add player", description: err.message, variant: "destructive" }),
  });

  // Copy invite link
  const handleCopyLink = async () => {
    if (!tournament) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${tournament.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({ title: "Invite link copied!" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  // Share invite link
  const handleShare = async () => {
    if (!tournament) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${tournament.inviteCode}`;
    const text = `Join my golf tournament "${tournament.name}" on PinPlay! 🏌️ ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, text, url: link });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Invite link copied!" });
    }
  };

  // Start My Round — navigate to a new game linked to tournament
  const handleStartRound = () => {
    setLocation(`/tournament/${tournamentId}/play`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Tournament not found</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    open: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
    in_progress: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    complete: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    cancelled: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
  };

  const statusLabels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    complete: "Complete",
    cancelled: "Cancelled",
  };

  const isCancelled = tournament.status === "cancelled";
  const isComplete = tournament.status === "complete";
  const isInProgress = tournament.status === "in_progress";
  const isOpen = tournament.status === "open";
  const isTeamFormat = tournament.format === "best_ball" || tournament.format === "scramble";
  const teamSize = (tournament.settings as any)?.teamSize || 4;

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* ── Header ── */}
      <div className="relative" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 40%, #1a3a2a 0%, #0d1f15 50%, #070f0a 100%)" }}>
        <div className="max-w-md mx-auto px-4 pt-4 pb-16 relative">
          {/* Back button */}
          <button
            onClick={() => setLocation("/")}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Tournament info */}
          <div className="mt-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              <span className="text-xs font-semibold text-yellow-400/80 uppercase tracking-wider">Tournament</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-tight">
              {tournament.name}
            </h1>

            <div className="flex items-center justify-center gap-4 mt-3 text-sm text-white/60">
              {tournament.courseName && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{tournament.courseName}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(tournament.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>

            {/* Status badge */}
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusColors[tournament.status]}`}>
                {isInProgress && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                {isOpen && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                {isComplete && <CheckCircle className="w-3 h-3" />}
                {isCancelled && <XCircle className="w-3 h-3" />}
                {statusLabels[tournament.status]}
              </span>
              <span className="text-xs text-white/50">
                {tournament.playerCount} player{tournament.playerCount !== 1 ? "s" : ""}
              </span>
              {tournament.format && tournament.format !== "stroke_play" && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/70 border border-white/15">
                  {tournament.format === "skins" && "Skins"}
                  {tournament.format === "best_ball" && "Best Ball"}
                  {tournament.format === "scramble" && "Scramble"}
                </span>
              )}
            </div>

            {/* Creator */}
            {tournament.creator && (
              <p className="text-xs text-white/40 mt-2">
                Hosted by {tournament.creator.name}
              </p>
            )}
          </div>
        </div>

        {/* Curved edge */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-background" style={{ borderRadius: "2rem 2rem 0 0" }} />
      </div>

      {/* ── Actions ── */}
      <div className="max-w-md mx-auto px-4 -mt-2">
        {/* Invite link row */}
        {!isCancelled && (
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 relative">
              <Input
                readOnly
                value={`${window.location.origin}/join/${tournament.inviteCode}`}
                className="text-xs pr-10 bg-card"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={handleCopyLink}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {copiedLink ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <Button
              onClick={handleShare}
              size="sm"
              className="bg-gold-500 hover:bg-gold-600 text-black font-semibold text-xs"
              style={{ background: "#C9A84C", color: "#000" }}
            >
              <Share2 className="w-3.5 h-3.5 mr-1" />
              Share
            </Button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 mb-4">
          {/* Creator actions */}
          {tournament.isCreator && isOpen && (
            <Button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending || tournament.playerCount < 2}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-green-600 hover:bg-green-700 text-white"
            >
              {startMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
              ) : (
                <><Play className="mr-2 h-4 w-4" />Start Tournament</>
              )}
            </Button>
          )}

          {tournament.isCreator && !isCancelled && !isComplete && (
            <Button
              onClick={() => {
                if (confirm("Are you sure you want to cancel this tournament?")) {
                  cancelMutation.mutate();
                }
              }}
              variant="outline"
              className="w-full py-2 rounded-xl text-sm text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              {cancelMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling...</>
              ) : (
                <><XCircle className="mr-2 h-4 w-4" />Cancel Tournament</>
              )}
            </Button>
          )}

          {/* Complete Tournament (creator, when in progress) */}
          {tournament.isCreator && isInProgress && (
            <Button
              onClick={() => {
                if (confirm("Mark this tournament as complete? Final results will be locked.")) {
                  completeMutation.mutate();
                }
              }}
              className="w-full py-2 rounded-xl text-sm bg-amber-600 hover:bg-amber-700 text-white"
            >
              {completeMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Completing...</>
              ) : (
                <><Flag className="mr-2 h-4 w-4" />Complete Tournament</>
              )}
            </Button>
          )}

          {/* Player actions */}
          {!tournament.isRegistered && !isCancelled && !isComplete && user && (
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={joinMutation.isPending}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: "#C9A84C", color: "#000" }}
            >
              {joinMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Joining...</>
              ) : (
                "Join Tournament"
              )}
            </Button>
          )}

          {tournament.isRegistered && !tournament.isCreator && !isCancelled && !isInProgress && (
            <Button
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
              variant="outline"
              className="w-full py-2 rounded-xl text-sm"
            >
              {leaveMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Leaving...</>
              ) : (
                "Leave Tournament"
              )}
            </Button>
          )}

          {/* Start My Round */}
          {tournament.isRegistered && isInProgress && (
            <Button
              onClick={handleStartRound}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-green-600 hover:bg-green-700 text-white"
            >
              <Gamepad2 className="mr-2 h-4 w-4" />
              Start My Round
            </Button>
          )}

          {/* Add Player (creator, when open or in progress) */}
          {tournament.isCreator && !isCancelled && !isComplete && (
            <div>
              {showAddPlayer ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Player name"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    maxLength={50}
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newPlayerName.trim()) {
                        addPlayerMutation.mutate(newPlayerName.trim());
                      }
                    }}
                  />
                  <Button
                    onClick={() => addPlayerMutation.mutate(newPlayerName.trim())}
                    disabled={!newPlayerName.trim() || addPlayerMutation.isPending}
                    size="sm"
                    className="bg-gold-500 hover:bg-gold-600 text-black font-semibold"
                    style={{ background: "#C9A84C", color: "#000" }}
                  >
                    {addPlayerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                  </Button>
                  <Button
                    onClick={() => { setShowAddPlayer(false); setNewPlayerName(""); }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowAddPlayer(true)}
                  variant="outline"
                  className="w-full py-2 rounded-xl text-sm"
                >
                  <UserPlus className="mr-2 h-4 w-4" />Add Player
                </Button>
              )}
            </div>
          )}

          {/* Guest join form (when not logged in) */}
          {!user && !isCancelled && !isComplete && (
            <div className="p-4 bg-card rounded-xl border border-border space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                Join as a guest without creating an account
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter your name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={50}
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && guestName.trim()) {
                      guestJoinMutation.mutate(guestName.trim());
                    }
                  }}
                />
                <Button
                  onClick={() => guestJoinMutation.mutate(guestName.trim())}
                  disabled={!guestName.trim() || guestJoinMutation.isPending}
                  className="font-semibold text-sm"
                  style={{ background: "#C9A84C", color: "#000" }}
                >
                  {guestJoinMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Join"
                  )}
                </Button>
              </div>
              <div className="text-center">
                <button
                  onClick={() => setLocation(`/auth?redirect=/tournament/${tournamentId}`)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Or sign in for full features
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`w-full grid mb-4 ${isTeamFormat ? "grid-cols-3" : "grid-cols-2"}`}>
            <TabsTrigger value="players" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Players ({tournament.players?.length || 0})
            </TabsTrigger>
            {isTeamFormat && (
              <TabsTrigger value="teams" className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Teams ({tournament.teams?.length || 0})
              </TabsTrigger>
            )}
            <TabsTrigger value="leaderboard" className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="players">
            <Card className="border-0 shadow-card">
              <CardContent className="p-3">
                <TournamentPlayerList
                  players={tournament.players || []}
                  currentUserId={user?.id}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {isTeamFormat && (
            <TabsContent value="teams">
              <Card className="border-0 shadow-card">
                <CardContent className="p-4">
                  <TournamentTeams
                    tournamentId={tournamentId!}
                    isRegistered={tournament.isRegistered}
                    isCreator={tournament.isCreator}
                    currentUser={user ? { id: user.id, name: user.name } : null}
                    teamSize={teamSize}
                    onTeamsChange={() => queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId] })}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="leaderboard">
            <TournamentLeaderboard
              tournamentId={tournamentId!}
              leaderboardData={wsLeaderboard}
              format={tournament?.format}
              teams={tournament.teams}
            />
          </TabsContent>
        </Tabs>

        {/* ── Active Games ── */}
        {tournament.games && tournament.games.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
              <Gamepad2 className="w-3.5 h-3.5" />
              Games in Progress
            </h3>
            <div className="space-y-2">
              {tournament.games.map(game => (
                <button
                  key={game.id}
                  onClick={() => setLocation(`/game/${game.id}`)}
                  className="w-full flex items-center justify-between p-3 bg-card rounded-xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-card border border-gray-200/50 dark:border-gray-700/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      game.active ? "bg-green-100 dark:bg-green-900/40" : "bg-gray-100 dark:bg-gray-800"
                    }`}>
                      {game.active ? (
                        <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">
                        {(game.players as string[]).join(", ")}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {game.active ? `Hole ${game.currentHole}` : "Complete"}
                        {game.courseName ? ` · ${game.courseName}` : ""}
                      </p>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer spacer */}
        <div className="h-16" />
      </div>
    </div>
  );
}
