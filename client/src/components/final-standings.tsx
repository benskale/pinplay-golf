import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Crown, Award, RotateCcw, TableProperties, ClipboardList, Save, UserPlus, CheckCircle2, HandMetal } from "lucide-react";
import { ShareModal } from "@/components/share-modal";
import { GhinExportModal } from "@/components/ghin-export-modal";
import Scorecard from "@/components/scorecard";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import type { Game } from "@shared/schema";
import { GAME_DEFINITIONS, isLowerBetter } from "@/lib/game-logic";

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
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const gameDef = GAME_DEFINITIONS[game.gameType];
  const gameName = gameDef?.name ?? game.gameType;
  const lower = isLowerBetter(game.gameType);
  const isWolfGame = game.gameType === "wolf" || game.gameType === "wolf_3";

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
  game.holeHistory.forEach(hole => {
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
    const sa = game.totalScores[a] ?? 0;
    const sb = game.totalScores[b] ?? 0;
    return lower ? sa - sb : sb - sa;
  });

  const winner = sortedPlayers[0];
  const winnerScore = game.totalScores[winner] ?? 0;

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
                        {isWolfGame && ` • Wolf ${game.wolfCounts?.[player] ?? 0}×`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary-700 dark:text-primary-400">
                      {game.totalScores[player] ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {lower ? "strokes" : "points"}
                    </p>
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
                  {game.holeHistory.length}
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

        {/* Full Scorecard */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <TableProperties className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Full Scorecard</h3>
            </div>
            <Scorecard game={game} />
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
        game={game}
      />
    </div>
  );
}
