import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareModal } from "@/components/share-modal";
import Scorecard from "@/components/scorecard";
import EditHoleModal from "@/components/edit-hole-modal";
import LiveSettlement from "@/components/live-settlement";
import {
  Share2, Crown, Minus, Plus, TableProperties, ClipboardList,
  Swords, Users, CheckCircle2, RotateCcw, Trophy, Zap, Target, MoreVertical, Trash2, Flag, Sparkles, Flame
} from "lucide-react";
import PinPlayLogo from "@/components/logo";
import { useToast } from "@/hooks/use-toast";
import {
  calcHoleResult, getLeaderboard, getGameStatus, getCurrentRotatingPlayer,
  getTeams, getPressSides, GAME_DEFINITIONS, MINI_GAME_DEFINITIONS, isLowerBetter, getStrokesReceivedOnHole, getStrokeHoles
} from "@/lib/game-logic";
import type { Game } from "@shared/schema";
import { trackGame, completeGame as untrackGame } from "@/lib/game-recovery";

interface ActiveGameProps {
  game: Game;
  myPlayer?: string;
  gameActions: {
    updateStrokes: (playerName: string, hole: number, strokes: number) => void;
    completeHole: (
      holePoints: Record<string, number>,
      holeStrokes: Record<string, number>,
      result: string,
      metadata: Record<string, any>,
    ) => void;
    editHole: (holeNumber: number, newStrokes: Record<string, number>) => void;
  };
  onAbort?: () => void;
}

type Tab = "scoring" | "scorecard";

const STROKE_COLOR_CLASSES = (diff: number) => {
  if (diff <= -2) return "text-yellow-600 dark:text-yellow-400 font-bold";
  if (diff === -1) return "text-green-600 dark:text-green-400 font-semibold";
  if (diff === 0) return "text-gray-600 dark:text-gray-400";
  if (diff === 1) return "text-orange-500";
  return "text-red-500";
};
const STROKE_LABEL = (diff: number) =>
  diff <= -2 ? `${Math.abs(diff)} under` : diff === -1 ? "Birdie" : diff === 0 ? "Par" : diff === 1 ? "Bogey" : `${diff} over`;

export default function ActiveGame({ game, myPlayer, gameActions, onAbort }: ActiveGameProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [tab, setTab] = useState<Tab>("scoring");
  const [holeStrokes, setHoleStrokes] = useState<Record<string, number>>({});

  // Wolf / rotating player decision
  const [wolfDecision, setWolfDecision] = useState<string | null>(null); // "alone" | "blind" | partner name

  // BBB selectors
  const [bbbWinners, setBbbWinners] = useState<{ bingo?: string; bango?: string; bongo?: string }>({});

  // Hammer multiplier
  const [hammerValue, setHammerValue] = useState(1);

  // Press system — universal multiplier with accept/decline
  const [pressMultiplier, setPressMultiplier] = useState(1);
  const [pendingPress, setPendingPress] = useState<{ from: string; fromSide: 'A' | 'B' } | null>(null);
  const [pressLog, setPressLog] = useState<Array<{ from: string; side: 'A' | 'B'; result: 'accepted' | 'dropped'; multiplier: number }>>([]);

  // Dots/Junk achievements per player
  const [dotAchievements, setDotAchievements] = useState<Record<string, string[]>>({});

  // Closest to the Pin (par 3s)
  const [closestToPin, setClosestToPin] = useState<string | "none" | null>(null);

  // Mini-games state
  const activeMiniGames = game.miniGames && typeof game.miniGames === "object"
    ? Object.entries(game.miniGames).filter(([_, v]) => v.enabled).map(([id]) => id)
    : [];
  const hasClosestToPinMiniGame = activeMiniGames.includes("closest_to_pin");
  // Show CTP if it's a mini-game OR if game has legacy CTP data (backward compat)
  const showCTP = hasClosestToPinMiniGame || (!activeMiniGames.length && true);

  // Per-hole mini-game tracking
  const [miniGameAchievements, setMiniGameAchievements] = useState<Record<string, string[]>>({});
  const [miniGameWinner, setMiniGameWinner] = useState<Record<string, string>>({});
  const [snake3Putt, setSnake3Putt] = useState<string[]>([]);

  // Edit hole modal
  const [editHoleNumber, setEditHoleNumber] = useState<number | null>(null);

  // Leaderboard view toggle (points vs dollars)
  const [leaderboardView, setLeaderboardView] = useState<"points" | "dollars">("points");

  const { toast } = useToast();

  // Track game in localStorage for guest recovery
  useEffect(() => {
    if (!game?.id) return;
    if (game.active === false) {
      // Game completed — remove from tracking
      untrackGame(game.id);
    } else {
      trackGame({
        id: game.id,
        gameType: game.gameType,
        players: game.players,
        courseName: game.courseName ?? "",
        currentHole: game.currentHole ?? 1,
        active: true,
      });
    }
  }, [game?.id, game?.currentHole, game?.active]);

  if (!game?.players?.length) {
    return <div className="flex items-center justify-center h-screen"><p className="text-gray-500">Loading...</p></div>;
  }

  const gameDef = GAME_DEFINITIONS[game.gameType] || GAME_DEFINITIONS.wolf;
  const strokesThisHole = (gameDef.needsHandicap || (game as any).gameSettings?.useHandicap) ? getStrokesReceivedOnHole(game, game.currentHole) : {};
  const currentPar = game.pars?.[game.currentHole - 1] ?? 4;
  const rotatingPlayer = getCurrentRotatingPlayer(game);
  const teams = getTeams(game);
  const isWolfGame = game.gameType === "wolf" || game.gameType === "wolf_3";
  const wolfSettings = (game as any).gameSettings || {};
  const wolfOrder = wolfSettings.wolfOrder ?? "last";
  const blindWolfEnabled = wolfSettings.blindWolf ?? false;
  const isTeamGame = gameDef.isTeamGame;
  const isBBB = game.gameType === "bingo_bango_bongo";
  const isHammer = game.gameType === "hammer";
  const isDots = game.gameType === "dots_junk";
  const isBanker = game.gameType === "banker";
  const isStrokes = ["stroke_play", "match_play", "nassau", "nassau_4", "best_ball_2", "best_ball_4",
    "skins", "skins_3", "skins_4", "stableford", "par_birdie", "sixes", "split_sixes"].includes(game.gameType);
  const isPar3 = currentPar === 3;
  const isTeamStrokes = ["scramble", "alternate_shot", "alternate_shot_4", "shamble"].includes(game.gameType);

  // Dollar value per point (0 = tracking only, no money)
  const pointValue = (game.gameSettings as any)?.pointValue || 0;

  // Press sides — determines who can press against whom
  const pressSides = useMemo(() => getPressSides(game), [game.players, game.teams]);
  const sideALabel = pressSides.sideA.length > 1 ? 'Team A' : (pressSides.sideA[0]?.split(' ')[0] || 'Side A');
  const sideBLabel = pressSides.sideB.length > 1 ? 'Team B' : (pressSides.sideB[0]?.split(' ')[0] || 'Side B');

  // For team-score games, only enter one score per team
  const scoreEntryPlayers = isTeamStrokes
    ? [teams[0][0], teams[1][0]] // first player from each team
    : game.players;

  const getInitials = (name: string) =>
    name.split(" ").map(p => p.charAt(0)).join("").toUpperCase().slice(0, 2);

  // Build extra metadata for calcHoleResult
  const extraMeta = useMemo(() => {
    const meta: Record<string, any> = {};
    if (isWolfGame) {
      meta.wolfPlayer = rotatingPlayer;
      meta.wolfDecision = wolfDecision;
    }
    if (isBBB) Object.assign(meta, bbbWinners);
    if (isHammer) meta.hammerValue = hammerValue;
    if (isDots) meta.dots = dotAchievements;
    if (isBanker) {} // banker uses currentWolfIndex automatically
    if (closestToPin) meta.closestToPin = closestToPin;
    // Mini-games data
    const mgData: Record<string, any> = {};
    activeMiniGames.forEach(id => {
      if (id === "sandies" || id === "polies" || id === "chippies") {
        mgData[id] = miniGameAchievements[id] || [];
      }
      if (id === "longest_drive") {
        mgData[id] = miniGameWinner[id] || null;
      }
      if (id === "closest_to_pin") {
        mgData[id] = closestToPin || null;
      }
      if (id === "snake") {
        mgData[id] = snake3Putt || [];
      }
      if (id === "trash") {
        mgData[id] = miniGameAchievements[id] || [];
      }
    });
    if (Object.keys(mgData).length > 0) meta.miniGames = mgData;
    if (pressMultiplier > 1) meta.pressMultiplier = pressMultiplier;
    if (pressLog.length > 0) meta.pressLog = pressLog;
    return meta;
  }, [isWolfGame, rotatingPlayer, wolfDecision, isBBB, bbbWinners, isHammer, hammerValue, isDots, dotAchievements, isBanker, closestToPin, miniGameAchievements, miniGameWinner, snake3Putt, activeMiniGames, pressMultiplier, pressLog]);

  // Auto-calculate result
  const calculatedResult = useMemo(() => {
    const allPlayersHaveStrokes = scoreEntryPlayers.every(p => holeStrokes[p] !== undefined && holeStrokes[p] > 0);
    if (!allPlayersHaveStrokes) return null;
    if (isWolfGame && !wolfDecision) return null;
    // For BBB, calculation can proceed with partial info
    const base = calcHoleResult(game, game.currentHole, currentPar, holeStrokes, extraMeta);
    // Apply universal press multiplier
    if (pressMultiplier > 1) {
      base.pointDeltas = Object.fromEntries(
        Object.entries(base.pointDeltas).map(([k, v]) => [k, Math.round(v * pressMultiplier)])
      );
      base.result += ` ×${pressMultiplier}`;
    }
    return base;
  }, [game, game.currentHole, currentPar, holeStrokes, extraMeta, scoreEntryPlayers, isWolfGame, wolfDecision, pressMultiplier]);

  const handleStrokeChange = (playerName: string, value: number) => {
    if (value < 1) return;
    setHoleStrokes(prev => ({ ...prev, [playerName]: value }));
    gameActions.updateStrokes(playerName, game.currentHole, value);
    // For team score games: apply same score to all team members
    if (isTeamStrokes) {
      const team = teams.find(t => t[0] === playerName);
      if (team) {
        team.forEach(p => gameActions.updateStrokes(p, game.currentHole, value));
      }
    }
  };

  const handleCompleteHole = () => {
    if (isWolfGame && !wolfDecision) {
      toast({ title: "Choose Wolf's decision first", variant: "destructive" }); return;
    }
    const missing = scoreEntryPlayers.filter(p => !holeStrokes[p]);
    if (missing.length > 0) {
      toast({ title: "Missing strokes", description: `Enter strokes for: ${missing.map(p => p.split(" ")[0]).join(", ")}`, variant: "destructive" });
      return;
    }
    if (!calculatedResult) return;

    // For team-score games, copy the score to all team members
    const fullStrokes: Record<string, number> = { ...holeStrokes };
    if (isTeamStrokes) {
      teams.forEach(team => {
        const teamScore = holeStrokes[team[0]];
        team.forEach(p => { fullStrokes[p] = teamScore; });
      });
    }

    // Merge CTP into metadata since calcHoleResult doesn't pass it through
    const finalMeta = { ...calculatedResult.metadata };
    if (closestToPin) finalMeta.closestToPin = closestToPin;
    // Ensure mini-games data is in metadata
    if (extraMeta.miniGames) finalMeta.miniGames = extraMeta.miniGames;
    if (pressMultiplier > 1) finalMeta.pressMultiplier = pressMultiplier;
    if (pressLog.length > 0) finalMeta.pressLog = pressLog;
    gameActions.completeHole(calculatedResult.pointDeltas, fullStrokes, calculatedResult.result, finalMeta);
    setWolfDecision(null);
    setHoleStrokes({});
    setBbbWinners({});
    setHammerValue(1);
    setDotAchievements({});
    setClosestToPin(null);
    setMiniGameAchievements({});
    setMiniGameWinner({});
    setSnake3Putt([]);
    setPressMultiplier(1);
    setPendingPress(null);
    setPressLog([]);

    toast({ title: `Hole ${game.currentHole} Complete!`, description: calculatedResult.result });
  };

  // ── Press system handlers ──
  const handleAcceptPress = () => {
    if (!pendingPress) return;
    const newMult = pressMultiplier * 2;
    setPressMultiplier(newMult);
    setPressLog(log => [...log, { from: pendingPress.from, side: pendingPress.fromSide, result: 'accepted', multiplier: newMult }]);
    setPendingPress(null);
  };

  const handleDropPress = () => {
    if (!pendingPress) return;
    const winners = pendingPress.fromSide === 'A' ? pressSides.sideA : pressSides.sideB;
    const losers  = pendingPress.fromSide === 'A' ? pressSides.sideB : pressSides.sideA;
    const mult = pressMultiplier; // winners get current value (before the declined press)

    const deltas: Record<string, number> = {};
    winners.forEach(w => { deltas[w] = losers.length * mult; });
    losers.forEach(l => { deltas[l] = -winners.length * mult; });

    const winnerLabel = pendingPress.fromSide === 'A' ? sideALabel : sideBLabel;
    const result = `PRESS DROPPED — ${winnerLabel} wins ×${mult > 1 ? mult : 1}`;
    const metadata: Record<string, any> = {
      pressDropped: true,
      pressWinners: winners,
      pressMultiplier: mult,
      pressLog: [...pressLog, { from: pendingPress.from, side: pendingPress.fromSide, result: 'dropped', multiplier: mult }],
    };

    // No strokes recorded for a conceded hole
    const emptyStrokes: Record<string, number> = {};
    gameActions.completeHole(deltas, emptyStrokes, result, metadata);

    // Reset all per-hole state
    setPressMultiplier(1);
    setPendingPress(null);
    setPressLog([]);
    setWolfDecision(null);
    setHoleStrokes({});
    setBbbWinners({});
    setHammerValue(1);
    setDotAchievements({});
    setClosestToPin(null);
    setMiniGameAchievements({});
    setMiniGameWinner({});
    setSnake3Putt([]);

    toast({ title: `Hole ${game.currentHole} — Press Dropped!`, description: result });
  };

  const leaderboard = getLeaderboard(game);
  const gameStatus = getGameStatus(game);
  const lower = isLowerBetter(game.gameType);
  const nonWolvesForDecision = game.players.filter(p => p !== rotatingPlayer);

  // Team label for a player
  const getTeamLabel = (player: string): { label: string; color: string } | null => {
    if (!isTeamGame) return null;
    const teamIdx = teams.findIndex(t => t.includes(player));
    return teamIdx === 0
      ? { label: "Team A", color: "bg-blue-500 text-white" }
      : { label: "Team B", color: "bg-orange-500 text-white" };
  };

  // Edit hole handler — sends via WebSocket for active games
  const handleEditHoleSave = (holeNumber: number, newStrokes: Record<string, number>) => {
    gameActions.editHole(holeNumber, newStrokes);
    setEditHoleNumber(null);
    toast({ title: `Hole ${holeNumber} updated` });
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ── Premium sticky header ── */}
      <header className="text-white z-50 sticky top-0 hero-texture" style={{ background: "linear-gradient(160deg, #070f0a 0%, #0d1f15 60%, #1a3a2a 100%)" }}>
        <div className="max-w-md mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo-dark.png" alt="PinPlay Golf" className="h-7 w-auto flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-[1.0625rem] font-bold leading-tight tracking-tight truncate">{gameDef.name}</h1>
                {game.courseName
                  ? <p className="text-[0.75rem] leading-none mt-0.5" style={{ color: "rgba(134,196,159,0.85)" }}>{game.courseName}</p>
                  : <p className="text-[0.75rem] leading-none mt-0.5" style={{ color: "rgba(134,196,159,0.7)" }}>{game.players.length} players</p>
                }
              </div>
            </div>
            <div className="flex items-center gap-1.5 relative">
              {myPlayer && (
                <span className="text-[0.6875rem] font-medium px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}>
                  {myPlayer.split(" ")[0]}
                </span>
              )}
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0 rounded-full hover:bg-white/15 text-white" onClick={() => setShowShareModal(true)}>
                <Share2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0 rounded-full hover:bg-white/15 text-white" onClick={() => setShowMenu(v => !v)}>
                <MoreVertical className="w-4 h-4" />
              </Button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden z-50 min-w-[160px]">
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        if (confirm("End this round? Incomplete data will be saved.")) {
                          onAbort?.();
                        }
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      End & Delete Round
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-md mx-auto px-4 pt-2 pb-0 flex gap-1">
          {(["scoring", "scorecard"] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 text-[0.8125rem] font-medium rounded-t-lg transition-colors border-b-2 ${
                tab === t
                  ? "text-secondary-500 border-secondary-500"
                  : "text-white/60 hover:text-white/90 border-transparent"
              }`}>
              {t === "scoring" ? <ClipboardList className="w-3.5 h-3.5" /> : <TableProperties className="w-3.5 h-3.5" />}
              {t === "scoring" ? "Scoring" : "Scorecard"}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-md mx-auto px-4 py-4 space-y-3 pb-24">
          {tab === "scorecard" ? (
            <Card><CardContent className="p-4"><Scorecard game={game} onEditHole={setEditHoleNumber} /></CardContent></Card>
          ) : (
            <>
              {/* Hole Info + Status */}
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  {/* Hole header strip */}
                  <div className="flex items-center justify-between px-5 pt-4 pb-3">
                    <div className="flex items-baseline gap-3">
                      <div>
                        <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground leading-none mb-0.5">Hole</p>
                        <span className="text-5xl font-display font-extrabold text-primary-700 dark:text-primary-300 leading-none tracking-tighter tabular-nums">{game.currentHole}</span>
                      </div>
                      <span className="text-[0.8125rem] font-medium text-muted-foreground mt-1">
                        Par {currentPar}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-muted-foreground leading-none mb-1">Status</p>
                      <p className="text-[0.8125rem] font-semibold text-gray-800 dark:text-gray-200 leading-tight">{gameStatus}</p>
                    </div>
                  </div>
                  <div className="h-px bg-border mx-5" />

                  {/* Wolf/Banker/Rotating player banner */}
                  {(isWolfGame || isBanker) && (
                    <div className="mx-5 my-3 flex items-center gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-xl p-3">
                      <Crown className="text-amber-500 w-5 h-5 flex-shrink-0" />
                      <div>
                        <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide leading-none">{isBanker ? "Banker" : "Wolf"}</p>
                        <p className="text-[0.9375rem] font-bold text-amber-700 dark:text-amber-300 leading-tight">{rotatingPlayer}</p>
                      </div>
                    </div>
                  )}

                  {/* Sixes: show current segment pairing */}
                  {(game.gameType === "sixes" || game.gameType === "split_sixes") && (() => {
                    const seg = game.currentHole <= 6 ? 0 : game.currentHole <= 12 ? 1 : 2;
                    const teamPairs: [number, number][] = [[0,1],[0,2],[1,2]];
                    const loneSeg = [2, 1, 0][seg];
                    const [t0, t1] = teamPairs[seg];
                    return (
                      <div className="mx-5 my-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
                        <p className="text-[0.6875rem] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide">Segment {seg + 1} · Holes {seg*6+1}–{seg*6+6}</p>
                        <p className="text-[0.875rem] text-blue-700 dark:text-blue-300 font-medium mt-0.5">
                          {game.players[t0].split(" ")[0]} + {game.players[t1].split(" ")[0]} <span className="text-gray-400 mx-1">vs</span> {game.players[loneSeg].split(" ")[0]}
                        </p>
                      </div>
                    );
                  })()}
                  <div className="pb-2" />
                </CardContent>
              </Card>

              {/* ── WOLF DECISION (Step 1 for wolf games) ── */}
              {isWolfGame && (
                <Card className={wolfDecision ? "ring-2 ring-primary-400" : ""}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Wolf's Decision</h3>
                      </div>
                      {wolfDecision && (
                        <button onClick={() => setWolfDecision(null)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                          <RotateCcw className="w-3 h-3" /> Change
                        </button>
                      )}
                    </div>

                    {wolfDecision ? (
                      <div className={`rounded-lg p-3 ${wolfDecision === "alone" || wolfDecision === "blind"
                        ? wolfDecision === "blind" ? "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
                        : "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
                        : "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"}`}>
                        {wolfDecision === "alone" || wolfDecision === "blind" ? (
                          <div className="flex items-center space-x-3">
                            <Swords className={`w-5 h-5 ${wolfDecision === "blind" ? "text-red-500" : "text-orange-500"}`} />
                            <div>
                              <p className={`font-semibold ${wolfDecision === "blind" ? "text-red-700 dark:text-red-300" : "text-orange-700 dark:text-orange-300"}`}>
                                {rotatingPlayer.split(" ")[0]} goes {wolfDecision === "blind" ? "BLIND WOLF!" : "alone!"}
                              </p>
                              <p className={`text-xs ${wolfDecision === "blind" ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`}>
                                {wolfDecision === "blind" ? "Declared before anyone teed off - max stakes! " : ""}vs {nonWolvesForDecision.map(p => p.split(" ")[0]).join(", ")}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-3">
                            <Users className="w-5 h-5 text-blue-500" />
                            <div>
                              <p className="font-semibold text-blue-700 dark:text-blue-300">
                                {rotatingPlayer.split(" ")[0]} + {wolfDecision.split(" ")[0]}
                              </p>
                              <p className="text-xs text-blue-600">
                                vs {game.players.filter(p => p !== rotatingPlayer && p !== wolfDecision).map(p => p.split(" ")[0]).join(" & ")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <p className="text-[0.6875rem] text-gray-400">
                            {wolfOrder === "first"
                              ? `Wolf hits first — decide partner or solo before watching others tee off`
                              : `Wolf hits last — watch all drives, then pick partner or go solo`
                            }
                          </p>
                        </div>

                        {/* Handicap strokes on this hole — shown before Wolf decides */}
                        {(game as any).gameSettings?.useHandicap && (() => {
                          const strokesThisHole = getStrokesReceivedOnHole(game, game.currentHole);
                          const anyone = Object.values(strokesThisHole).some(v => v > 0);
                          if (!anyone) return null;
                          return (
                            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2.5 mb-2">
                              <p className="text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">Strokes on this hole:</p>
                              <div className="flex flex-wrap gap-2">
                                {game.players.map(p => {
                                  const s = strokesThisHole[p] || 0;
                                  if (s === 0) return null;
                                  return (
                                    <span key={p} className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                                      {p.split(" ")[0]} +{s}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        <p className="text-xs text-gray-500 mb-3">
                          <span className="font-medium text-wolf-500">{rotatingPlayer}</span> — go alone or pick a partner:
                        </p>
                        {blindWolfEnabled && (
                          <Button className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 mb-2"
                            onClick={() => setWolfDecision("blind")}>
                            <span className="mr-1">🐺</span> Blind Wolf (Solo, Pre-Drive)
                          </Button>
                        )}
                        <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3"
                          onClick={() => setWolfDecision("alone")}>
                          <Swords className="w-4 h-4 mr-2" /> Go Alone
                        </Button>
                        <div className={`grid grid-cols-${nonWolvesForDecision.length} gap-2 mt-2`}>
                          {nonWolvesForDecision.map(player => (
                            <Button key={player} variant="outline"
                              className="flex flex-col items-center py-3 h-auto border-2 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                              onClick={() => setWolfDecision(player)}>
                              <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center mb-1">
                                <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">{getInitials(player)}</span>
                              </div>
                              <span className="text-xs font-medium">{player.split(" ")[0]}</span>
                              <span className="text-xs text-blue-500">Partner</span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── HAMMER VALUE ── */}
              {isHammer && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        <div>
                          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Hammer</h3>
                          <p className="text-xs text-gray-500">Current bet value: <span className="font-bold text-yellow-600">×{hammerValue}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setHammerValue(v => Math.max(1, v / 2))} disabled={hammerValue <= 1}>
                          ÷2
                        </Button>
                        <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white" onClick={() => setHammerValue(v => v * 2)}>
                          ×2 Hammer!
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── PRESS SYSTEM ── (universal, all game types except Hammer which has its own) */}
              {!isHammer && (
                <Card className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Flame className="w-5 h-5 text-purple-500" />
                        <div>
                          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">Press</h3>
                          <p className="text-xs text-gray-500">
                            Hole value: <span className="font-bold text-purple-600">×{pressMultiplier}</span>
                            {pressLog.length > 0 && ` • ${pressLog.length} press${pressLog.length > 1 ? 'es' : ''}`}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Press log */}
                    {pressLog.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {pressLog.map((p, i) => (
                          <div key={i} className="text-xs flex items-center gap-2">
                            <span className="text-purple-600 font-medium">{p.from.split(' ')[0]}</span>
                            <span className="text-gray-500">
                              pressed → {p.result === 'accepted' ? `×${p.multiplier}` : <span className="text-red-500 font-medium">DROPPED</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Pending press — accept/drop */}
                    {pendingPress ? (
                      <div className="space-y-2">
                        <div className="bg-white dark:bg-gray-800 rounded-lg p-2 text-sm font-medium text-center text-gray-700 dark:text-gray-300">
                          <Flame className="w-4 h-4 inline text-purple-500 mr-1" />
                          {pendingPress.from.split(' ')[0]} pressed!
                          <span className="block text-xs text-gray-500 mt-0.5">
                            {(pendingPress.fromSide === 'A' ? sideBLabel : sideALabel)}: accept ×{pressMultiplier * 2} or drop?
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={handleAcceptPress}
                          >
                            Accept ×{pressMultiplier * 2}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                            onClick={handleDropPress}
                          >
                            Drop (concede)
                          </Button>
                        </div>
                        <button
                          className="w-full text-xs text-gray-400 hover:text-gray-600"
                          onClick={() => setPendingPress(null)}
                        >
                          Cancel press
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-purple-300 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                          onClick={() => setPendingPress({ from: pressSides.sideA[0] || sideALabel, fromSide: 'A' })}
                        >
                          {sideALabel} Press
                          {pointValue > 0 && <span className="ml-1 text-[0.625rem] opacity-70">${pointValue * pressMultiplier * 2}/pt</span>}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-purple-300 text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/40"
                          onClick={() => setPendingPress({ from: pressSides.sideB[0] || sideBLabel, fromSide: 'B' })}
                        >
                          {sideBLabel} Press
                          {pointValue > 0 && <span className="ml-1 text-[0.625rem] opacity-70">${pointValue * pressMultiplier * 2}/pt</span>}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── HANDICAP STROKE ALLOCATION SUMMARY ── */}
              {(gameDef.needsHandicap || (game as any).gameSettings?.useHandicap) && (() => {
                const playersWithStrokes = game.players.filter(p => getStrokeHoles(game, p).length > 0);
                if (playersWithStrokes.length === 0) return null;
                return (
                  <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40">
                    <CardContent className="p-3">
                      <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mb-2">Handicap Strokes This Round</p>
                      <div className="space-y-1.5">
                        {game.players.map(p => {
                          const lowestHdcp = Math.min(...game.players.map(q => game.handicaps[q] || 0));
                          const diff = Math.max(0, (game.handicaps[p] || 0) - lowestHdcp);
                          const strokeHoles = getStrokeHoles(game, p);
                          const getsStrokeOnThisHole = strokeHoles.includes(game.currentHole);
                          return (
                            <div key={p} className={`flex items-start gap-2 text-xs ${getsStrokeOnThisHole ? "font-semibold" : ""}`}>
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-20 truncate flex-shrink-0">{p.split(" ")[0]}</span>
                              {diff === 0 ? (
                                <span className="text-gray-400 dark:text-gray-500">plays scratch (no strokes)</span>
                              ) : (
                                <span className={getsStrokeOnThisHole ? "text-emerald-600 dark:text-emerald-400" : "text-emerald-700 dark:text-emerald-400"}>
                                  {diff} stroke{diff !== 1 ? "s" : ""} on hole{strokeHoles.length !== 1 ? "s" : ""}{" "}
                                  {strokeHoles.length <= 9
                                    ? strokeHoles.join(", ")
                                    : `${strokeHoles.slice(0, 6).join(", ")} …+${strokeHoles.length - 6}`}
                                  {getsStrokeOnThisHole && <span className="ml-1 text-emerald-600 dark:text-emerald-400">← gets 1 stroke on this hole</span>}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── STROKE ENTRY ── */}
              <Card className={isWolfGame && !wolfDecision ? "opacity-50 pointer-events-none" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-primary-700 text-white flex items-center justify-center text-[0.625rem] font-bold flex-shrink-0">
                      {isWolfGame ? "2" : "1"}
                    </div>
                    <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
                      {isTeamStrokes ? "Team Scores" : "Enter Strokes"}
                    </h3>
                    {isTeamStrokes && (
                      <span className="text-[0.6875rem] text-muted-foreground ml-1">one score per team</span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {scoreEntryPlayers.map(player => {
                      const teamLabel = getTeamLabel(player);
                      const teamMembers = isTeamStrokes ? teams.find(t => t[0] === player) : undefined;
                      const stroke = holeStrokes[player];
                      const diff = stroke !== undefined ? stroke - currentPar : null;
                      const hasStroke = stroke !== undefined;

                      return (
                        <div key={player} className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors ${
                          hasStroke
                            ? "bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-200 dark:ring-primary-800"
                            : "bg-gray-50 dark:bg-gray-800/50"
                        }`}>
                          {/* Player info */}
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold ${
                              hasStroke ? "bg-primary-700 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                            }`}>
                              {getInitials(player)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-[0.875rem] font-semibold text-gray-900 dark:text-gray-100">
                                  {isTeamStrokes && teamMembers ? teamMembers.map(p => p.split(" ")[0]).join(" + ") : player.split(" ")[0]}
                                </p>
                                {teamLabel && (
                                  <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full ${teamLabel.color}`}>{teamLabel.label}</span>
                                )}
                                {(strokesThisHole[player] ?? 0) > 0 && (
                                  <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                                    +{strokesThisHole[player]}
                                  </span>
                                )}
                              </div>
                              {diff !== null && (
                                <p className={`text-[0.75rem] font-medium leading-none mt-0.5 ${STROKE_COLOR_CLASSES(diff)}`}>{STROKE_LABEL(diff)}</p>
                              )}
                            </div>
                          </div>

                          {/* Score stepper */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              className="w-9 h-9 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
                              onClick={() => handleStrokeChange(player, (stroke || currentPar) - 1)}>
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-12 h-9 flex items-center justify-center">
                              <span className={`text-[1.5rem] font-bold leading-none ${hasStroke ? "text-primary-700 dark:text-primary-400" : "text-gray-300 dark:text-gray-600"}`}>
                                {stroke || "—"}
                              </span>
                            </div>
                            <button
                              className="w-9 h-9 rounded-md bg-primary-700 flex items-center justify-center text-white hover:bg-primary-800 active:scale-95 transition-all shadow-sm"
                              onClick={() => handleStrokeChange(player, (stroke || currentPar) + 1)}>
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ── BINGO BANGO BONGO ── */}
              {isBBB && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">BBB Points</h3>
                    {[
                      { key: "bingo", label: "Bingo 🏌️", desc: "First on the green" },
                      { key: "bango", label: "Bango 📍", desc: "Closest to pin when all on" },
                      { key: "bongo", label: "Bongo 🕳️", desc: "First to hole out" },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="mb-3">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label} — {desc}</p>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!bbbWinners[key as keyof typeof bbbWinners] ? "bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-500" : "hidden"}`}
                            onClick={() => setBbbWinners(prev => ({ ...prev, [key]: undefined }))}
                          >
                            None
                          </button>
                          {game.players.map(player => (
                            <button key={player}
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                bbbWinners[key as keyof typeof bbbWinners] === player
                                  ? "bg-green-500 text-white border-green-500"
                                  : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-400"
                              }`}
                              onClick={() => setBbbWinners(prev => ({
                                ...prev,
                                [key]: prev[key as keyof typeof bbbWinners] === player ? undefined : player
                              }))}>
                              {player.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* ── CLOSEST TO THE PIN SELECTOR (par 3s only) ── */}
              {isPar3 && showCTP && (
                <Card className="border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
                        Closest to the Pin 🎯
                      </h3>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                          closestToPin === "none"
                            ? "bg-gray-500 text-white border-gray-500 shadow-sm"
                            : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400"
                        }`}
                        onClick={() => setClosestToPin(closestToPin === "none" ? null : "none")}>
                        No one 🚫
                      </button>
                      {game.players.map(player => (
                        <button key={player}
                          className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                            closestToPin === player
                              ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                              : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-emerald-400"
                          }`}
                          onClick={() => setClosestToPin(closestToPin === player ? null : player)}>
                          {player.split(" ")[0]}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── DOTS / JUNK ── */}
              {isDots && (
                <Card>
                  <CardContent className="p-5">
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">Dots / Junk</h3>
                    {game.players.map(player => (
                      <div key={player} className="mb-3">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{player.split(" ")[0]}</p>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { id: "birdie", label: "Birdie +1" },
                            { id: "eagle", label: "Eagle +2" },
                            { id: "sandy", label: "Sandy +1" },
                            { id: "greenie", label: "Greenie +1" },
                            { id: "snake", label: "Snake -1" },
                          ].map(dot => {
                            const active = (dotAchievements[player] || []).includes(dot.id);
                            return (
                              <button key={dot.id}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  active
                                    ? dot.id === "snake" ? "bg-red-500 text-white border-red-500" : "bg-green-500 text-white border-green-500"
                                    : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                                }`}
                                onClick={() => setDotAchievements(prev => {
                                  const current = prev[player] || [];
                                  return {
                                    ...prev,
                                    [player]: active ? current.filter(d => d !== dot.id) : [...current, dot.id],
                                  };
                                })}>
                                {dot.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* ── MINI-GAMES INPUTS ── */}
              {activeMiniGames.length > 0 && (() => {
                // Filter to mini-games that need input this hole
                const holeMiniGames = activeMiniGames.filter(id => {
                  const def = MINI_GAME_DEFINITIONS[id];
                  if (!def) return false;
                  if (def.inputType === "auto") return false; // auto-tracked, no input needed
                  if (def.holeFilter === "par3" && !isPar3) return false;
                  if (def.holeFilter === "par5" && currentPar !== 5) return false;
                  return true;
                });
                if (holeMiniGames.length === 0) return null;

                return (
                  <Card className="border-primary-200 dark:border-primary-800">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-primary-500" />
                        <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">Side Games</h3>
                      </div>

                      {holeMiniGames.map(mgId => {
                        const def = MINI_GAME_DEFINITIONS[mgId];
                        if (!def) return null;

                        // Winner-style (one player wins) — longest drive, closest to pin
                        if (def.inputType === "winner") {
                          const winner = miniGameWinner[mgId];
                          return (
                            <div key={mgId}>
                              <p className="text-[0.8125rem] font-medium text-gray-700 dark:text-gray-300 mb-2">{def.name}</p>
                              <div className="flex gap-2 flex-wrap">
                                {game.players.map(player => (
                                  <button key={player}
                                    className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                                      winner === player
                                        ? "bg-primary-500 text-white border-primary-500 shadow-sm"
                                        : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-primary-400"
                                    }`}
                                    onClick={() => setMiniGameWinner(prev => ({
                                      ...prev,
                                      [mgId]: prev[mgId] === player ? "" : player
                                    }))}>
                                    {player.split(" ")[0]}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        // Achievement-style (multiple players can earn) — sandies, polies, chippies, snake, trash
                        if (def.inputType === "achievement") {
                          if (mgId === "snake") {
                            // Snake: who 3-putted?
                            return (
                              <div key={mgId}>
                                <p className="text-[0.8125rem] font-medium text-gray-700 dark:text-gray-300 mb-2">Snake — 3-putts</p>
                                <div className="flex gap-2 flex-wrap">
                                  {game.players.map(player => {
                                    const active = snake3Putt.includes(player);
                                    return (
                                      <button key={player}
                                        className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                                          active
                                            ? "bg-red-500 text-white border-red-500 shadow-sm"
                                            : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-red-400"
                                        }`}
                                        onClick={() => setSnake3Putt(prev =>
                                          prev.includes(player) ? prev.filter(p => p !== player) : [...prev, player]
                                        )}>
                                        {player.split(" ")[0]}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          if (mgId === "trash") {
                            // Trash/Junk: multiple achievement types per player
                            const trashTypes = [
                              { id: "birdie", label: "Birdie" },
                              { id: "sandy", label: "Sandy" },
                              { id: "chip_in", label: "Chip-in" },
                              { id: "greenie", label: "Greenie" },
                            ];
                            return (
                              <div key={mgId}>
                                <p className="text-[0.8125rem] font-medium text-gray-700 dark:text-gray-300 mb-2">Trash / Junk</p>
                                {game.players.map(player => (
                                  <div key={player} className="mb-2">
                                    <p className="text-[0.6875rem] text-muted-foreground mb-1">{player.split(" ")[0]}</p>
                                    <div className="flex gap-1.5 flex-wrap">
                                      {trashTypes.map(tt => {
                                        const key = `${mgId}_${player}_${tt.id}`;
                                        const achievements = miniGameAchievements[mgId] || [];
                                        const active = achievements.includes(`${player}:${tt.id}`);
                                        return (
                                          <button key={tt.id}
                                            className={`px-2.5 py-1 rounded-full text-[0.6875rem] font-medium border transition-colors ${
                                              active
                                                ? "bg-green-500 text-white border-green-500"
                                                : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                                            }`}
                                            onClick={() => setMiniGameAchievements(prev => {
                                              const current = prev[mgId] || [];
                                              const tag = `${player}:${tt.id}`;
                                              return {
                                                ...prev,
                                                [mgId]: active ? current.filter(a => a !== tag) : [...current, tag],
                                              };
                                            })}>
                                            {tt.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          // Generic achievement: tap player to toggle
                          return (
                            <div key={mgId}>
                              <p className="text-[0.8125rem] font-medium text-gray-700 dark:text-gray-300 mb-2">{def.name}</p>
                              <div className="flex gap-2 flex-wrap">
                                {game.players.map(player => {
                                  const achievements = miniGameAchievements[mgId] || [];
                                  const active = achievements.includes(player);
                                  return (
                                    <button key={player}
                                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                                        active
                                          ? "bg-green-500 text-white border-green-500 shadow-sm"
                                          : "bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-green-400"
                                      }`}
                                      onClick={() => setMiniGameAchievements(prev => {
                                        const current = prev[mgId] || [];
                                        return {
                                          ...prev,
                                          [mgId]: active ? current.filter(p => p !== player) : [...current, player],
                                        };
                                      })}>
                                      {player.split(" ")[0]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── RESULT PREVIEW + COMPLETE ── */}
              <Card className={isWolfGame && !wolfDecision ? "opacity-60" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-6 h-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold">
                      {isWolfGame ? "3" : "2"}
                    </div>
                    <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                      {lower ? "Scores" : "Points"} Preview
                    </h3>
                  </div>

                  {calculatedResult ? (
                    <div className="mb-4">
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {game.players.map(player => {
                          const pts = calculatedResult.pointDeltas[player] ?? 0;
                          const isWinner = lower ? false : pts > 0;
                          const isLoser = pts < 0;
                          return (
                            <div key={player} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                              isWinner ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700"
                                : isLoser ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                            }`}>
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mr-1">{player.split(" ")[0]}</span>
                              <span className={`font-bold text-base flex-shrink-0 ${
                                isWinner ? "text-green-600 dark:text-green-400"
                                  : isLoser ? "text-red-500"
                                  : "text-gray-400"
                              }`}>
                                {lower ? pts : pts > 0 ? `+${pts}` : pts === 0 ? "0" : pts}
                                {pointValue > 0 && !lower && pts !== 0 && (
                                  <span className="text-[0.6875rem] font-semibold ml-1 opacity-70">
                                    {pts > 0 ? "+" : ""}${Math.round(pts * pointValue)}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400 italic">{calculatedResult.result}</p>
                    </div>
                  ) : (
                    <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {isWolfGame && !wolfDecision ? "Complete step 1 first" : "Enter all strokes to preview"}
                      </p>
                    </div>
                  )}

                  <Button
                    className="w-full bg-secondary-500 hover:bg-secondary-600 text-white py-3 font-semibold text-[0.9375rem] rounded-lg shadow-sm"
                    onClick={handleCompleteHole}
                    disabled={!calculatedResult}
                    data-testid="button-complete-hole">
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                    {game.currentHole < 18 ? `Complete Hole ${game.currentHole}` : "Finish Round"}
                  </Button>
                </CardContent>
              </Card>

              {/* ── LEADERBOARD ── */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">Leaderboard</h3>
                  </div>

                  {/* Points / Dollars toggle */}
                  {pointValue > 0 && !lower && (
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg mb-3">
                      <button
                        className={`flex-1 py-1.5 rounded-md text-[0.8125rem] font-medium transition-colors ${
                          leaderboardView === "points"
                            ? "bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-200"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => setLeaderboardView("points")}
                      >
                        Points
                      </button>
                      <button
                        className={`flex-1 py-1.5 rounded-md text-[0.8125rem] font-medium transition-colors ${
                          leaderboardView === "dollars"
                            ? "bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-200"
                            : "text-muted-foreground"
                        }`}
                        onClick={() => setLeaderboardView("dollars")}
                      >
                        Dollars
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {leaderboard.map((entry, i) => {
                      const total = game.totalScores?.[entry.player] ?? 0;
                      const showDollars = leaderboardView === "dollars" && pointValue > 0 && !lower;
                      const displayValue = showDollars
                        ? `${total > 0 ? "+" : total < 0 ? "-" : ""}$${Math.abs(Math.round(total * pointValue))}`
                        : entry.displayScore;

                      return (
                      <div key={entry.player} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${
                        i === 0
                          ? "bg-amber-50 dark:bg-amber-950/25 ring-1 ring-amber-200 dark:ring-amber-800"
                          : "bg-gray-50 dark:bg-gray-800/50"
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                            i === 0 ? "bg-amber-400 text-white"
                            : i === 1 ? "bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200"
                            : i === 2 ? "bg-orange-300 dark:bg-orange-700 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-500"
                          }`}>
                            {entry.rank}
                          </div>
                          <div>
                            <p className="text-[0.875rem] font-semibold text-gray-800 dark:text-gray-200">{entry.player.split(" ")[0]}</p>
                            {(game.gameType === "wolf" || game.gameType === "wolf_3") && (
                              <p className="text-[0.6875rem] text-muted-foreground leading-none">Wolf {game.wolfCounts[entry.player] || 0}×</p>
                            )}
                            {showDollars && (
                              <p className="text-[0.6875rem] leading-none mt-0.5 font-medium text-muted-foreground tabular-nums">
                                {total > 0 ? "+" : ""}{total} pts
                              </p>
                            )}
                            {pointValue > 0 && !lower && leaderboardView === "points" && (
                              <p className="text-[0.6875rem] leading-none mt-0.5 font-medium" style={{ color: total > 0 ? "#16a34a" : total < 0 ? "#dc2626" : undefined }}>
                                {total > 0 ? "+" : ""}${Math.round(total * pointValue)}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`text-[1.375rem] font-bold leading-none tabular-nums ${
                          showDollars && total !== 0
                            ? total > 0 ? "text-green-600 dark:text-green-400" : "text-red-500"
                            : i === 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
                        }`}>
                          {displayValue}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ── LIVE SETTLEMENT (who owes whom) ── */}
              {pointValue > 0 && !lower && (
                <LiveSettlement game={game} />
              )}


              {/* ── CLOSEST TO THE PIN TRACKER (always visible) ── */}
              {(() => {
                const ctpWins: Record<string, number> = {};
                const ctpHoles: { hole: number; winner: string }[] = [];
                game.holeHistory.forEach(h => {
                  if (h.metadata?.closestToPin && h.metadata.closestToPin !== "none") {
                    const w = h.metadata.closestToPin;
                    ctpWins[w] = (ctpWins[w] || 0) + 1;
                    ctpHoles.push({ hole: h.hole, winner: w });
                  }
                });
                // Show tracker once any CTP data exists or on a par 3
                const hasData = Object.keys(ctpWins).length > 0;
                if (!hasData && !isPar3) return null;
                return (
                  <Card className="border-emerald-200 dark:border-emerald-800">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
                          Closest to the Pin 🎯
                        </h3>
                      </div>
                      {!hasData && isPar3 ? (
                        <p className="text-[0.75rem] text-gray-400 dark:text-gray-500">Select a winner above to start tracking</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {game.players.map(player => {
                            const wins = ctpWins[player] || 0;
                            const wonHoles = ctpHoles.filter(c => c.winner === player).map(c => c.hole);
                            return (
                              <div key={player} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                                wins > 0
                                  ? "bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-800"
                                  : "bg-gray-50 dark:bg-gray-800/50"
                              }`}>
                                <span className={`text-xl font-display font-extrabold leading-none tabular-nums ${
                                  wins > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-300 dark:text-gray-600"
                                }`}>
                                  {wins}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[0.8125rem] font-semibold text-gray-800 dark:text-gray-200 truncate">{player.split(" ")[0]}</p>
                                  {wonHoles.length > 0 && (
                                    <p className="text-[0.625rem] text-emerald-500 dark:text-emerald-400 truncate">
                                      {wonHoles.length === 1 ? `Hole ${wonHoles[0]}` : `Holes ${wonHoles.join(", ")}`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── MINI-GAMES RUNNING TOTALS ── */}
              {activeMiniGames.length > 0 && (() => {
                // Compute running totals from hole history
                const mgTotals: Record<string, Record<string, number>> = {};
                const mgConfig = game.miniGames || {};

                activeMiniGames.forEach(id => { mgTotals[id] = {}; game.players.forEach(p => { mgTotals[id][p] = 0; }); });

                game.holeHistory.forEach(h => {
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
                      // Auto-count birdies and eagles from strokes
                      const holePar = game.pars?.[h.hole - 1] ?? 4;
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
                      // Auto-determine: player who won hole outright
                      const points = h.points || {};
                      const winners = game.players.filter(p => (points[p] || 0) > 0);
                      if (winners.length === 1) {
                        mgTotals[id][winners[0]]++;
                      }
                    }
                  });
                });

                const hasAnyData = activeMiniGames.some(id => Object.values(mgTotals[id]).some(v => v > 0));
                if (!hasAnyData) return null;

                return (
                  <Card className="border-primary-200 dark:border-primary-800">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-primary-500" />
                        <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">Side Games</h3>
                      </div>
                      <div className="space-y-3">
                        {activeMiniGames.map(id => {
                          const def = MINI_GAME_DEFINITIONS[id];
                          if (!def) return null;
                          const totals = mgTotals[id];
                          const hasData = Object.values(totals).some(v => v > 0);
                          if (!hasData && def.inputType === "auto") return null;

                          const value = mgConfig[id]?.value || 0;

                          return (
                            <div key={id} className="pb-3 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[0.8125rem] font-semibold text-gray-700 dark:text-gray-300">{def.name}</p>
                                {value > 0 && (
                                  <span className="text-[0.6875rem] text-muted-foreground">${value} {def.valueLabel}</span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {game.players.map(player => {
                                  const count = totals[player] || 0;
                                  return (
                                    <div key={player} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${
                                      count > 0
                                        ? "bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-200 dark:ring-primary-800"
                                        : "bg-gray-50 dark:bg-gray-800/50"
                                    }`}>
                                      <span className={`text-lg font-display font-extrabold leading-none tabular-nums ${
                                        count > 0 ? "text-primary-600 dark:text-primary-400" : "text-gray-300 dark:text-gray-600"
                                      }`}>
                                        {count}
                                      </span>
                                      <span className={`text-[0.8125rem] font-medium ${
                                        count > 0 ? "text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"
                                      }`}>
                                        {player.split(" ")[0]}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── HOLE HISTORY ── */}
              <Card>
                <CardContent className="p-5">
                  <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4">Hole History</h3>
                  {game.holeHistory.length === 0 ? (
                    <p className="text-sm text-center text-gray-500 py-6">No holes completed yet</p>
                  ) : (
                    <div className="space-y-3">
                      {[...game.holeHistory].reverse().map(hole => {
                        const holePar = game.pars?.[hole.hole - 1] ?? 4;
                        const wolfPlayer = hole.metadata?.wolfPlayer;
                        const wolfDecisionH = hole.metadata?.wolfDecision;
                        const banker = hole.metadata?.banker;
                        return (
                          <div key={hole.hole} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <div className="w-7 h-7 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold text-primary-700 dark:text-primary-300">{hole.hole}</span>
                                </div>
                                <div>
                                  {wolfPlayer && (
                                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                      🐺 {wolfPlayer.split(" ")[0]}
                                      {wolfDecisionH && wolfDecisionH !== "alone" && wolfDecisionH !== "blind" && <span className="text-gray-500"> + {wolfDecisionH.split(" ")[0]}</span>}
                                      {wolfDecisionH === "alone" && <span className="text-orange-500"> alone</span>}
                                      {wolfDecisionH === "blind" && <span className="text-red-500"> BLIND WOLF</span>}
                                    </p>
                                  )}
                                  {banker && <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Banker: {banker.split(" ")[0]}</p>}
                                  <p className="text-xs text-gray-400">Par {holePar}</p>
                                </div>
                              </div>
                              <span className="text-xs text-gray-500 text-right max-w-[150px] leading-tight">{hole.result}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {game.players.map(player => {
                                const pts = hole.points[player] ?? 0;
                                const str = hole.strokes?.[player];
                                const isWinner = lower ? false : pts > 0;
                                const isLoser = pts < 0;
                                return (
                                  <div key={player} className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                                    isWinner ? "bg-green-50 dark:bg-green-950/30"
                                      : isLoser ? "bg-red-50 dark:bg-red-950/30"
                                      : "bg-white dark:bg-gray-700"
                                  }`}>
                                    <span className={`font-medium truncate mr-1 ${isWinner ? "text-green-700 dark:text-green-300" : isLoser ? "text-red-600" : "text-gray-600 dark:text-gray-400"}`}>
                                      {player.split(" ")[0]}
                                      {player === wolfPlayer ? " 🐺" : wolfDecisionH === player ? " 🤝" : ""}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      {str ? <span className="text-gray-400">{str}</span> : null}
                                      {!lower && pts !== 0 && <span className={`font-bold ${isWinner ? "text-green-600" : "text-red-500"}`}>{pts > 0 ? `+${pts}` : pts}</span>}
                                      {lower && str ? <span className="text-gray-500">{str - holePar === 0 ? "E" : str - holePar > 0 ? `+${str - holePar}` : str - holePar}</span> : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>

      <ShareModal isOpen={showShareModal} onClose={() => setShowShareModal(false)} gameId={game.id} />

      {editHoleNumber !== null && (
        <EditHoleModal
          game={game}
          holeNumber={editHoleNumber}
          open={editHoleNumber !== null}
          onOpenChange={(open) => { if (!open) setEditHoleNumber(null); }}
          onSave={handleEditHoleSave}
        />
      )}
    </div>
  );
}
