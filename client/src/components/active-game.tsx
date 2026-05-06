import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareModal } from "@/components/share-modal";
import Scorecard from "@/components/scorecard";
import {
  Share2, Crown, Minus, Plus, TableProperties, ClipboardList,
  Swords, Users, CheckCircle2, RotateCcw, Trophy, Zap, Target, MoreVertical, Trash2
} from "lucide-react";
import PinPlayLogo from "@/components/logo";
import { useToast } from "@/hooks/use-toast";
import {
  calcHoleResult, getLeaderboard, getGameStatus, getCurrentRotatingPlayer,
  getTeams, GAME_DEFINITIONS, isLowerBetter, getStrokesReceivedOnHole, getStrokeHoles
} from "@/lib/game-logic";
import type { Game } from "@shared/schema";

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
  const [wolfDecision, setWolfDecision] = useState<string | null>(null); // "alone" | partner name

  // BBB selectors
  const [bbbWinners, setBbbWinners] = useState<{ bingo?: string; bango?: string; bongo?: string }>({});

  // Hammer multiplier
  const [hammerValue, setHammerValue] = useState(1);

  // Dots/Junk achievements per player
  const [dotAchievements, setDotAchievements] = useState<Record<string, string[]>>({});

  // Closest to the Pin (par 3s)
  const [closestToPin, setClosestToPin] = useState<string | "none" | null>(null);

  const { toast } = useToast();

  if (!game?.players?.length) {
    return <div className="flex items-center justify-center h-screen"><p className="text-gray-500">Loading...</p></div>;
  }

  const gameDef = GAME_DEFINITIONS[game.gameType] || GAME_DEFINITIONS.wolf;
  const strokesThisHole = gameDef.needsHandicap ? getStrokesReceivedOnHole(game, game.currentHole) : {};
  const currentPar = game.pars?.[game.currentHole - 1] ?? 4;
  const rotatingPlayer = getCurrentRotatingPlayer(game);
  const teams = getTeams(game);
  const isWolfGame = game.gameType === "wolf" || game.gameType === "wolf_3";
  const isTeamGame = gameDef.isTeamGame;
  const isBBB = game.gameType === "bingo_bango_bongo";
  const isHammer = game.gameType === "hammer";
  const isDots = game.gameType === "dots_junk";
  const isBanker = game.gameType === "banker";
  const isStrokes = ["stroke_play", "match_play", "nassau", "nassau_4", "best_ball_2", "best_ball_4",
    "skins", "skins_3", "skins_4", "stableford", "par_birdie", "sixes", "split_sixes"].includes(game.gameType);
  const isPar3 = currentPar === 3;
  const isTeamStrokes = ["scramble", "alternate_shot", "alternate_shot_4", "shamble"].includes(game.gameType);

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
    return meta;
  }, [isWolfGame, rotatingPlayer, wolfDecision, isBBB, bbbWinners, isHammer, hammerValue, isDots, dotAchievements, isBanker]);

  // Auto-calculate result
  const calculatedResult = useMemo(() => {
    const allPlayersHaveStrokes = scoreEntryPlayers.every(p => holeStrokes[p] !== undefined && holeStrokes[p] > 0);
    if (!allPlayersHaveStrokes) return null;
    if (isWolfGame && !wolfDecision) return null;
    // For BBB, calculation can proceed with partial info
    return calcHoleResult(game, game.currentHole, currentPar, holeStrokes, extraMeta);
  }, [game, game.currentHole, currentPar, holeStrokes, extraMeta, scoreEntryPlayers, isWolfGame, wolfDecision]);

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
    gameActions.completeHole(calculatedResult.pointDeltas, fullStrokes, calculatedResult.result, finalMeta);
    setWolfDecision(null);
    setHoleStrokes({});
    setBbbWinners({});
    setHammerValue(1);
    setDotAchievements({});
    setClosestToPin(null);

    toast({ title: `Hole ${game.currentHole} Complete!`, description: calculatedResult.result });
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
            <Card><CardContent className="p-4"><Scorecard game={game} /></CardContent></Card>
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
                      <div className={`rounded-lg p-3 ${wolfDecision === "alone"
                        ? "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
                        : "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"}`}>
                        {wolfDecision === "alone" ? (
                          <div className="flex items-center space-x-3">
                            <Swords className="w-5 h-5 text-orange-500" />
                            <div>
                              <p className="font-semibold text-orange-700 dark:text-orange-300">{rotatingPlayer.split(" ")[0]} goes alone!</p>
                              <p className="text-xs text-orange-600 dark:text-orange-400">
                                vs {nonWolvesForDecision.map(p => p.split(" ")[0]).join(", ")}
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
                        <p className="text-xs text-gray-500 mb-3">
                          <span className="font-medium text-wolf-500">{rotatingPlayer}</span> — go alone or pick a partner:
                        </p>
                        <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3"
                          onClick={() => setWolfDecision("alone")}>
                          <Swords className="w-4 h-4 mr-2" /> Go Alone 🐺
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

              {/* ── HANDICAP STROKE ALLOCATION SUMMARY ── */}
              {gameDef.needsHandicap && (() => {
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
                          return (
                            <div key={p} className="flex items-start gap-2 text-xs">
                              <span className="font-medium text-gray-700 dark:text-gray-300 w-20 truncate flex-shrink-0">{p.split(" ")[0]}</span>
                              {diff === 0 ? (
                                <span className="text-gray-400 dark:text-gray-500">plays scratch (no strokes)</span>
                              ) : (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  {diff} stroke{diff !== 1 ? "s" : ""} on hole{strokeHoles.length !== 1 ? "s" : ""}{" "}
                                  {strokeHoles.length <= 9
                                    ? strokeHoles.join(", ")
                                    : `${strokeHoles.slice(0, 6).join(", ")} …+${strokeHoles.length - 6}`}
                                  {" "}(HCP {diff <= 18 ? `1–${diff}` : `all +${diff - 18} more`})
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
              {isPar3 && (
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
                  <div className="space-y-1.5">
                    {leaderboard.map((entry, i) => (
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
                          </div>
                        </div>
                        <span className={`text-[1.375rem] font-bold leading-none ${
                          i === 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
                        }`}>
                          {entry.displayScore}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

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
                                      {wolfDecisionH && wolfDecisionH !== "alone" && <span className="text-gray-500"> + {wolfDecisionH.split(" ")[0]}</span>}
                                      {wolfDecisionH === "alone" && <span className="text-orange-500"> alone</span>}
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
    </div>
  );
}
