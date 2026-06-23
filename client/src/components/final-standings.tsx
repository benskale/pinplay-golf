import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Crown, Award, RotateCcw, TableProperties, ClipboardList, Save, UserPlus, CheckCircle2, HandMetal, Sparkles, DollarSign } from "lucide-react";
import { ShareModal } from "@/components/share-modal";
import { GhinExportModal } from "@/components/ghin-export-modal";
import RoundStats from "@/components/round-stats";
import Scorecard from "@/components/scorecard";
import EditHoleModal from "@/components/edit-hole-modal";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Game } from "@shared/schema";
import { GAME_DEFINITIONS, MINI_GAME_DEFINITIONS, isLowerBetter } from "@/lib/game-logic";
import { useToast } from "@/hooks/use-toast";
import { getLiveSettlement } from "@/lib/settlement";
import { ArrowRight } from "lucide-react";

interface FinalStandingsProps {
  game: Game;
  onNewGame: () => void;
}

export function FinalStandings({ game, onNewGame }: FinalStandingsProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showGhinModal, setShowGhinModal] = useState(false);
  const [showSaveBanner, setShowSaveBanner] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [claimingPlayer, setClaimingPlayer] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [editHoleNumber, setEditHoleNumber] = useState<number | null>(null);
  const [updatedGame, setUpdatedGame] = useState<Game | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const gameDef = GAME_DEFINITIONS[game.gameType];
  const gameName = gameDef?.name ?? game.gameType;
  const displayGame = updatedGame || game;

  // Edit hole handler for completed games (uses REST PATCH)
  const handleEditHoleSave = async (holeNumber: number, newStrokes: Record<string, number>) => {
    try {
      const res = await apiRequest("PATCH", `/api/games/${game.id}/hole/${holeNumber}`, { strokes: newStrokes });
      const updated = await res.json();
      setUpdatedGame(updated);
      setEditHoleNumber(null);
      toast({ title: `Hole ${holeNumber} updated` });
    } catch (err) {
      toast({ title: "Failed to update hole", variant: "destructive" });
    }
  };
  const lower = isLowerBetter(game.gameType);
  const isWolfGame = game.gameType === "wolf" || game.gameType === "wolf_3";

  // Dollar value per point for the main game
  const pointValue = (game.gameSettings as any)?.pointValue || 0;

  // Determine if this is the game creator (has userId match) or a visitor
  const isCreator = user && game.userId === user.id;
  const isPlayerByName = user && (game.players as string[]).some(
    p => p.toLowerCase() === user.name.toLowerCase()
  );
  const isMyGame = isCreator || isPlayerByName;

  // Show save/claim banner after a delay
  useEffect(() => {
    const t = setTimeout(() => {
      if (user) {
        // Logged in — check if already linked
        if (isMyGame) {
          setClaimed(true);
        }
        setShowSaveBanner(false);
      } else {
        // Guest — show the claim prompt
        setShowClaim(true);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [user, isMyGame]);

  // When user logs in (e.g., from the inline auth form), claim the game
  useEffect(() => {
    if (user && claimingPlayer && !claimed) {
      // Claim the game for this user
      apiRequest("POST", `/api/games/${game.id}/claim`, { playerName: claimingPlayer })
        .then(() => setClaimed(true))
        .catch(() => {});
    }
  }, [user, claimingPlayer, claimed, game.id]);

  // Count hole wins per player
  const holeWins: Record<string, number> = {};
  game.players.forEach(p => { holeWins[p] = 0; });
  displayGame.holeHistory.forEach(hole => {
    const vals = Object.values(hole.points);
    const best = lower ? Math.min(...vals) : Math.max(...vals);
    if (lower ? best < 999 : best > 0) {
      Object.entries(hole.points).forEach(([player, pts]) => {
        if (pts === best) holeWins[player]++;
      });
    }
  });

  // Sort players — lower-is-better games sort ascending
  const sortedPlayers = [...game.players].sort((a, b) => {
    const sa = displayGame.totalScores[a] ?? 0;
    const sb = displayGame.totalScores[b] ?? 0;
    return lower ? sa - sb : sb - sa;
  });

  const winner = sortedPlayers[0];
  const winnerScore = displayGame.totalScores[winner] ?? 0;

  const getPositionIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (index === 1) return <Award className="w-6 h-6 text-gray-400" />;
    if (index === 2) return <Award className="w-6 h-6 text-amber-600" />;
    return (
      <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
        <span className="text-xs font-bold text-gray-600">{index + 1}</span>
      </div>
    );
  };

  const getPositionBg = (index: number) => {
    if (index === 0) return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
    if (index === 1) return "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700";
    if (index === 2) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700";
  };

  const handleSignupAndClaim = async () => {
    const email = (document.getElementById("claim-email") as HTMLInputElement)?.value;
    const name = (document.getElementById("claim-name") as HTMLInputElement)?.value;
    const password = (document.getElementById("claim-password") as HTMLInputElement)?.value;
    if (!email || !name || !password) return;
    try {
      const res = await apiRequest("POST", "/api/auth/register", { email, name, password });
      if (!res.ok) {
        const e = await res.json();
        alert(e.message || "Signup failed");
        return;
      }
      // The session-linking in auth.ts will auto-link this session's games
      const userData = await res.json();
      const { queryClient } = await import("@/lib/queryClient");
      queryClient.setQueryData(["/api/auth/user"], userData);
      setShowAuth(false);
      setClaimed(true);
    } catch (err: any) {
      alert(err.message || "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="text-white shadow-lg" style={{ background: "linear-gradient(160deg, #081f10 0%, #0f3520 60%, #155e35 100%)" }}>
        <div className="max-w-md mx-auto px-4 py-6 text-center">
          <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-300" />
          <h1 className="text-2xl font-bold">Game Complete!</h1>
          <p style={{ color: "rgba(134,196,159,0.85)" }}>{gameName} — Final Results</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">

        {/* ── "Was this you?" Claim Banner (for guests viewing shared link) ── */}
        {showClaim && !user && !showAuth && !claimed && (
          <Card className="border-primary-300 dark:border-primary-700 bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/40 dark:to-gray-800 shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                  <HandMetal className="w-5 h-5 text-primary-700 dark:text-primary-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">Was this you?</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Claim this round to save it to your golf profile.
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Tap your name:</p>
              <div className="space-y-2">
                {(game.players as string[]).map(player => (
                  <button
                    key={player}
                    onClick={() => {
                      setClaimingPlayer(player);
                      setShowAuth(true);
                    }}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors text-left"
                  >
                    <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                        {player.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
                      </span>
                    </div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{player}</span>
                  </button>
                ))}
              </div>
              <button
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 mt-2"
                onClick={() => setShowClaim(false)}
              >
                Just viewing
              </button>
            </CardContent>
          </Card>
        )}

        {/* ── Auth inline form for claim ── */}
        {showAuth && !user && (
          <Card className="border-primary-300 dark:border-primary-700 shadow-md">
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                Claim as {claimingPlayer?.split(" ")[0]}
              </h3>
              <p className="text-sm text-gray-500">Create a free account to save this round.</p>
              <input
                type="email"
                placeholder="Email"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                id="claim-email"
              />
              <input
                type="text"
                placeholder="Name"
                defaultValue={claimingPlayer ?? ""}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                id="claim-name"
              />
              <input
                type="password"
                placeholder="Password (6+ characters)"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                id="claim-password"
              />
              <Button
                className="w-full bg-primary-700 hover:bg-primary-800 text-white rounded-xl py-2.5"
                onClick={handleSignupAndClaim}
              >
                <UserPlus className="w-4 h-4 mr-1.5" />
                Claim Round
              </Button>
              <a
                href={`/api/auth/google?claim=${game.id}`}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </a>
              <button
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
                onClick={() => { setShowAuth(false); setClaimingPlayer(null); }}
              >
                Cancel
              </button>
            </CardContent>
          </Card>
        )}

        {/* ── Save banner (guest creators) ── */}
        {showSaveBanner && !user && !showClaim && !showAuth && !claimed && (
          <Card className="border-primary-300 dark:border-primary-700 bg-gradient-to-br from-primary-50 to-white dark:from-primary-950/40 dark:to-gray-800 shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
                  <Save className="w-5 h-5 text-primary-700 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">Save this round?</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Create a free account to save this round, track your history, and build your golf profile.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1 bg-primary-700 hover:bg-primary-800 text-white rounded-xl"
                  onClick={() => setShowAuth(true)}
                >
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Sign Up Free
                </Button>
                <Button
                  variant="ghost"
                  className="text-gray-500 hover:text-gray-700"
                  onClick={() => setShowSaveBanner(false)}
                >
                  Maybe Later
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Already saved confirmation ── */}
        {user && (claimed || isMyGame) && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            <span className="text-sm text-green-700 dark:text-green-300">Round saved to your profile</span>
          </div>
        )}

        {/* Winner */}
        <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-6 text-center">
            <Crown className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
              🏆 {winner} Wins!
            </h2>
            <p className="text-lg text-yellow-700 dark:text-yellow-300 font-semibold">
              {lower ? `${winnerScore} strokes` : `${winnerScore} points`}
            </p>
            {pointValue > 0 && !lower && (
              <p className="text-[0.8125rem] text-green-600 dark:text-green-400 font-bold">
                ${(Math.round(winnerScore * pointValue)).toLocaleString()} in winnings
              </p>
            )}
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Congratulations on a great round!
            </p>
          </CardContent>
        </Card>

        {/* Final Standings */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Final Standings</h3>
            <div className="space-y-3">
              {sortedPlayers.map((player, index) => (
                <div key={player} className={`flex items-center justify-between p-4 rounded-lg border ${getPositionBg(index)}`}>
                  <div className="flex items-center space-x-4">
                    {getPositionIcon(index)}
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{player}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {holeWins[player]} holes won
                        {isWolfGame && ` • Wolf ${displayGame.wolfCounts?.[player] ?? 0}×`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary-700 dark:text-primary-400">
                      {displayGame.totalScores[player] ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {lower ? "strokes" : "points"}
                    </p>
                    {pointValue > 0 && !lower && (
                      <p className={`text-[0.75rem] font-bold ${
                        (displayGame.totalScores[player] ?? 0) > 0
                          ? "text-green-600 dark:text-green-400"
                          : (displayGame.totalScores[player] ?? 0) < 0
                            ? "text-red-500"
                            : "text-gray-400"
                      }`}>
                        {(displayGame.totalScores[player] ?? 0) > 0 ? "+" : ""}${Math.round((displayGame.totalScores[player] ?? 0) * pointValue)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Game Summary */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Game Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">
                  {displayGame.holeHistory.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Holes Played</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">
                  {game.players.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Players</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Round Stats (birdies, pars, bogeys breakdown) */}
        <RoundStats game={displayGame} />

        {/* ── MAIN GAME SETTLEMENT (point value × points = $) ── */}
        {pointValue > 0 && !lower && (() => {
          const pps: Record<string, number> = {};
          game.players.forEach(p => { pps[p] = (displayGame.totalScores[p] ?? 0) * pointValue; });
          const maxPP = Math.max(...Object.values(pps));
          const minPP = Math.min(...Object.values(pps));
          return (
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Game Payout</h3>
                  <span className="text-[0.75rem] text-muted-foreground ml-auto">{pointValue > 0 ? `$${pointValue}/point` : ""}</span>
                </div>
                <div className="space-y-2">
                  {sortedPlayers.map(player => {
                    const amt = pps[player];
                    return (
                      <div key={player} className={`flex items-center justify-between px-4 py-3 rounded-xl ${
                        amt > 0
                          ? "bg-green-50 dark:bg-green-950/30 ring-1 ring-green-200 dark:ring-green-800"
                          : amt < 0
                            ? "bg-red-50 dark:bg-red-950/20"
                            : "bg-gray-50 dark:bg-gray-800/50"
                      }`}>
                        <span className="text-[0.9375rem] font-medium text-gray-800 dark:text-gray-200">{player}</span>
                        <span className={`text-[1.0625rem] font-bold ${
                          amt > 0 ? "text-green-600 dark:text-green-400"
                            : amt < 0 ? "text-red-500"
                            : "text-gray-400"
                        }`}>
                          {amt > 0 ? "+" : ""}${Math.round(amt).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[0.6875rem] text-muted-foreground mt-3 text-center">
                  Settlement = total points × ${pointValue}/point. Press multipliers already included in points.
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Mini-Games Settlement */}
        {(() => {
          const activeMiniGames = displayGame.miniGames && typeof displayGame.miniGames === "object"
            ? Object.entries(displayGame.miniGames).filter(([_, v]) => v.enabled).map(([id]) => id)
            : [];
          if (activeMiniGames.length === 0) return null;

          const mgTotals: Record<string, Record<string, number>> = {};
          const mgConfig = displayGame.miniGames || {};

          activeMiniGames.forEach(id => { mgTotals[id] = {}; game.players.forEach(p => { mgTotals[id][p] = 0; }); });

          displayGame.holeHistory.forEach(h => {
            const mg = h.metadata?.miniGames || {};
            activeMiniGames.forEach(id => {
              if (id === "sandies" || id === "polies" || id === "chippies") {
                (mg[id] || []).forEach((p: string) => { if (mgTotals[id][p] !== undefined) mgTotals[id][p]++; });
              }
              if (id === "longest_drive" && mg[id]) {
                if (mgTotals[id][mg[id]] !== undefined) mgTotals[id][mg[id]]++;
              }
              if (id === "closest_to_pin" && mg[id] && mg[id] !== "none") {
                if (mgTotals[id][mg[id]] !== undefined) mgTotals[id][mg[id]]++;
              }
              if (id === "snake") {
                (mg[id] || []).forEach((p: string) => { if (mgTotals[id][p] !== undefined) mgTotals[id][p]++; });
              }
              if (id === "birdie_pool") {
                const holePar = displayGame.pars?.[h.hole - 1] ?? 4;
                game.players.forEach(p => {
                  const str = h.strokes?.[p];
                  if (str && str <= holePar - 1) mgTotals[id][p]++;
                });
              }
              if (id === "trash") {
                (mg[id] || []).forEach((entry: string) => {
                  const [player] = entry.split(":");
                  if (mgTotals[id][player] !== undefined) mgTotals[id][player]++;
                });
              }
              if (id === "rabbit") {
                const points = h.points || {};
                const winners = game.players.filter(p => (points[p] || 0) > 0);
                if (winners.length === 1) mgTotals[id][winners[0]]++;
              }
            });
          });

          return (
            <Card className="border-primary-200 dark:border-primary-800">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-primary-500" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Side Games Settlement</h3>
                </div>
                <div className="space-y-4">
                  {activeMiniGames.map(id => {
                    const def = MINI_GAME_DEFINITIONS[id];
                    if (!def) return null;
                    const totals = mgTotals[id];
                    const value = mgConfig[id]?.value || 0;
                    const hasData = Object.values(totals).some(v => v > 0);

                    return (
                      <div key={id} className="pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200">{def.name}</p>
                          {value > 0 && (
                            <span className="text-[0.75rem] text-muted-foreground bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                              ${value} {def.valueLabel}
                            </span>
                          )}
                        </div>

                        {/* Achievement-style: show counts */}
                        {(id === "sandies" || id === "polies" || id === "chippies" || id === "snake" || id === "longest_drive" || id === "closest_to_pin" || id === "trash") && (
                          <div className="grid grid-cols-2 gap-2">
                            {game.players.map(player => {
                              const count = totals[player] || 0;
                              const earnings = count * value;
                              return (
                                <div key={player} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${
                                  count > 0
                                    ? "bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-200 dark:ring-primary-800"
                                    : "bg-gray-50 dark:bg-gray-800/50"
                                }`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xl font-display font-extrabold leading-none ${
                                      count > 0 ? "text-primary-600 dark:text-primary-400" : "text-gray-300 dark:text-gray-600"
                                    }`}>{count}</span>
                                    <span className={`text-[0.8125rem] font-medium ${
                                      count > 0 ? "text-gray-800 dark:text-gray-200" : "text-gray-400"
                                    }`}>{player.split(" ")[0]}</span>
                                  </div>
                                  {value > 0 && count > 0 && (
                                    <span className="text-[0.75rem] font-bold text-green-600 dark:text-green-400">
                                      {id === "snake" ? `−$${earnings}` : `+$${earnings}`}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Birdie Pool: winner takes pot */}
                        {id === "birdie_pool" && (
                          <div>
                            <div className="grid grid-cols-2 gap-2">
                              {game.players.map(player => {
                                const count = totals[player] || 0;
                                const isLeader = count === Math.max(...Object.values(totals));
                                return (
                                  <div key={player} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${
                                    isLeader && count > 0
                                      ? "bg-green-50 dark:bg-green-950/30 ring-1 ring-green-200 dark:ring-green-800"
                                      : "bg-gray-50 dark:bg-gray-800/50"
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xl font-display font-extrabold leading-none ${
                                        isLeader && count > 0 ? "text-green-600 dark:text-green-400" : "text-gray-400"
                                      }`}>{count}</span>
                                      <span className="text-[0.8125rem] font-medium">{player.split(" ")[0]}</span>
                                    </div>
                                    {isLeader && count > 0 && (
                                      <span className="text-[0.75rem] font-bold text-green-600">
                                        wins ${value * game.players.length}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {hasData && <p className="text-[0.6875rem] text-muted-foreground mt-2 text-center">Pool: ${value} x {game.players.length} players = ${value * game.players.length}</p>}
                          </div>
                        )}

                        {/* Rabbit: times caught */}
                        {id === "rabbit" && (
                          <div className="grid grid-cols-2 gap-2">
                            {game.players.map(player => {
                              const count = totals[player] || 0;
                              return (
                                <div key={player} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${
                                  count > 0
                                    ? "bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-200 dark:ring-primary-800"
                                    : "bg-gray-50 dark:bg-gray-800/50"
                                }`}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xl font-display font-extrabold text-primary-600">{count}</span>
                                    <span className="text-[0.8125rem] font-medium">{player.split(" ")[0]}</span>
                                  </div>
                                  {count > 0 && value > 0 && (
                                    <span className="text-[0.75rem] font-bold text-green-600">+${count * value}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {!hasData && def.inputType === "auto" && (
                          <p className="text-[0.75rem] text-gray-400 text-center py-2">No data tracked</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── COMBINED TOTAL SETTLEMENT (main game + side games) ── */}
        {(() => {
          const settlement = getLiveSettlement(displayGame);
          if (!settlement.hasMainGame && !settlement.hasMiniGames) return null;
          if (settlement.transactions.length === 0) return null;

          return (
            <Card className="border-emerald-300 dark:border-emerald-700 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Total Settlement</h3>
                  <span className="text-[0.6875rem] text-muted-foreground ml-auto font-medium">Combined</span>
                </div>

                {/* Net balances */}
                <div className="space-y-1.5 mb-4">
                  {[...game.players].sort((a, b) => (settlement.netBalances[b] ?? 0) - (settlement.netBalances[a] ?? 0)).map(player => {
                    const amt = settlement.netBalances[player] ?? 0;
                    const main = settlement.mainGameBalances[player] ?? 0;
                    const side = settlement.miniGameBalances[player] ?? 0;
                    const hasSplit = settlement.hasMainGame && settlement.hasMiniGames && (Math.abs(main) > 0.01 || Math.abs(side) > 0.01);
                    return (
                      <div key={player} className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${
                        amt > 0 ? "bg-green-50 dark:bg-green-950/30 ring-1 ring-green-200 dark:ring-green-800"
                          : amt < 0 ? "bg-red-50 dark:bg-red-950/20"
                          : "bg-gray-50 dark:bg-gray-800/50"
                      }`}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[0.9375rem] font-medium text-gray-800 dark:text-gray-200">{player}</span>
                          {hasSplit && (
                            <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                              {main !== 0 && `${main > 0 ? "+" : ""}$${Math.round(main)} game`}
                              {main !== 0 && side !== 0 && " · "}
                              {side !== 0 && `${side > 0 ? "+" : ""}$${Math.round(side)} sides`}
                            </span>
                          )}
                        </div>
                        <span className={`text-[1.0625rem] font-bold tabular-nums ${
                          amt > 0 ? "text-green-600 dark:text-green-400" : amt < 0 ? "text-red-500" : "text-gray-400"
                        }`}>
                          {amt > 0 ? "+" : amt < 0 ? "-" : ""}${Math.abs(Math.round(amt)).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Who owes whom */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <p className="text-[0.6875rem] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Who Owes Whom</p>
                  <div className="space-y-1.5">
                    {settlement.transactions.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-2 text-[0.875rem]">
                          <span className="font-medium text-red-500 dark:text-red-400">{t.from}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                          <span className="font-medium text-green-600 dark:text-green-400">{t.to}</span>
                        </div>
                        <span className="text-[1rem] font-bold tabular-nums text-gray-700 dark:text-gray-300">${t.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[0.6875rem] text-muted-foreground mt-3 text-center">
                  {settlement.hasMainGame && settlement.hasMiniGames
                    ? `Includes main game + all side games`
                    : settlement.hasMainGame
                      ? `Main game: ${settlement.pointValue > 0 ? `$${settlement.pointValue}/point` : ""}`
                      : "Side games only"}
                </p>
              </CardContent>
            </Card>
          );
        })()}

        {/* Full Scorecard */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <TableProperties className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Full Scorecard</h3>
            </div>
            <Scorecard game={displayGame} onEditHole={setEditHoleNumber} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3 pb-8">
          <Button
            className="w-full bg-primary-700 hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700 text-white py-3 rounded-xl font-semibold"
            onClick={() => setShowShareModal(true)}
          >
            Share Final Results
          </Button>
          <Button
            variant="outline"
            className="w-full border-primary-500 text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:border-primary-400 dark:hover:bg-primary-950 py-3 rounded-xl font-semibold"
            onClick={() => setShowGhinModal(true)}
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            Post to GHIN
          </Button>
          <Button
            variant="outline"
            className="w-full border-gray-300 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-800 py-3 rounded-xl"
            onClick={onNewGame}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start New Game
          </Button>
        </div>
      </main>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        gameId={game.id}
        isCompleted={!game.active}
      />
      <GhinExportModal
        isOpen={showGhinModal}
        onClose={() => setShowGhinModal(false)}
        game={displayGame}
      />

      {editHoleNumber !== null && (
        <EditHoleModal
          game={displayGame}
          holeNumber={editHoleNumber}
          open={editHoleNumber !== null}
          onOpenChange={(open) => { if (!open) setEditHoleNumber(null); }}
          onSave={handleEditHoleSave}
        />
      )}
    </div>
  );
}
