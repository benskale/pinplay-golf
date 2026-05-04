import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ChevronDown, ChevronUp, CheckCircle, MapPin, Search, X,
  Users, ChevronRight, ArrowLeft, Shuffle
} from "lucide-react";
import { getGamesForPlayerCount, type GameDef } from "@/lib/game-logic";

interface GameSetupProps {
  onGameCreated: (gameId: string) => void;
}

interface CourseResult {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  holes: number;
}

interface CourseDetail {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  pars: number[];
  hcpRanks: number[] | null; // HCP rank per hole (1=hardest), null if unavailable
}

const DEFAULT_PARS = Array(18).fill(4);

type Step = "count" | "game" | "players";

const PLAYER_COUNT_OPTIONS = [
  { count: 2, label: "2 Players", icon: "🏌️‍♂️🏌️‍♂️", desc: "Match Play, Skins, Nassau & more" },
  { count: 3, label: "3 Players", icon: "🏌️‍♂️🏌️‍♂️🏌️‍♂️", desc: "Wolf, Sixes, Bingo Bango Bongo" },
  { count: 4, label: "4 Players", icon: "🏌️‍♂️🏌️‍♂️🏌️‍♂️🏌️‍♂️", desc: "Wolf, Scramble, Vegas & more" },
];

export default function GameSetup({ onGameCreated }: GameSetupProps) {
  const [step, setStep] = useState<Step>("count");
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [selectedGame, setSelectedGame] = useState<GameDef | null>(null);
  const [players, setPlayers] = useState<string[]>(["", "", "", ""]);
  const [handicaps, setHandicaps] = useState<Record<string, number>>({});
  const [teams, setTeams] = useState<string[][]>([]);
  const [teamAssignment, setTeamAssignment] = useState<Record<string, "A" | "B">>({});
  const [courseQuery, setCourseQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [pars, setPars] = useState<number[]>([...DEFAULT_PARS]);
  const [showParSetup, setShowParSetup] = useState(false);
  const [strokeIndexes, setStrokeIndexes] = useState<number[]>(Array.from({ length: 18 }, (_, i) => i + 1));
  const [hcpRanksSource, setHcpRanksSource] = useState<"default" | "course" | "manual">("default");
  const [showSISetup, setShowSISetup] = useState(false);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Keep players array in sync with player count
  useEffect(() => {
    setPlayers(prev => {
      const newPlayers = Array(playerCount).fill("").map((_, i) => prev[i] || "");
      return newPlayers;
    });
  }, [playerCount]);

  // Debounce course search
  useEffect(() => {
    if (selectedCourse) return;
    const timer = setTimeout(() => setDebouncedQuery(courseQuery), 400);
    return () => clearTimeout(timer);
  }, [courseQuery, selectedCourse]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const { data: searchData, isFetching: isSearching } = useQuery<{ courses: CourseResult[] }>({
    queryKey: ["/api/courses/search", debouncedQuery],
    enabled: debouncedQuery.length >= 2 && !selectedCourse,
    queryFn: async () => {
      const res = await fetch(`/api/courses/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) return { courses: [] };
      return res.json();
    },
  });

  const handleSelectCourse = async (course: CourseResult) => {
    setSelectedCourse(course);
    setCourseQuery(course.name);
    setShowDropdown(false);
    setLoadingCourse(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`);
      if (!res.ok) throw new Error();
      const detail: CourseDetail = await res.json();
      if (detail.pars?.length === 18) {
        setPars(detail.pars);
      }
      if (detail.hcpRanks?.length === 18) {
        setStrokeIndexes(detail.hcpRanks);
        setHcpRanksSource("course");
        setShowSISetup(true); // auto-expand so user can see ranks loaded
      } else {
        setHcpRanksSource("default");
      }
      const hcpNote = detail.hcpRanks
        ? " · HCP ranks auto-filled"
        : " · HCP ranks not available — enter them manually below";
      toast({ title: "Course loaded!", description: `${detail.name} — Par ${detail.par}${hcpNote}` });
    } catch {
      toast({ title: "Course found", description: "Scorecard data unavailable. Set pars manually.", variant: "destructive" });
    } finally {
      setLoadingCourse(false);
    }
  };

  const createGameMutation = useMutation({
    mutationFn: async (gameData: any) => {
      const response = await apiRequest("POST", "/api/games", gameData);
      return response.json();
    },
    onSuccess: (game) => { onGameCreated(game.id); },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message || "Failed to create game", variant: "destructive" });
    },
  });

  const handleSelectCount = (count: number) => {
    setPlayerCount(count);
    setSelectedGame(null);
    setStep("game");
  };

  const handleSelectGame = (game: GameDef) => {
    setSelectedGame(game);
    setStep("players");
    // Default team assignment for team games
    if (game.isTeamGame) {
      const assignment: Record<string, "A" | "B"> = {};
      players.slice(0, playerCount).forEach((_, i) => {
        assignment[`player_${i}`] = i < Math.floor(playerCount / 2) ? "A" : "B";
      });
      setTeamAssignment(assignment);
    }
  };

  const shuffleArray = (array: string[]) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const handleStartGame = () => {
    const validPlayers = players.slice(0, playerCount).filter(n => n.trim() !== "");
    if (validPlayers.length !== playerCount) {
      toast({ title: "Missing names", description: `Enter names for all ${playerCount} players`, variant: "destructive" });
      return;
    }

    // For wolf-style games, randomize order
    const isWolfGame = selectedGame?.id === "wolf" || selectedGame?.id === "wolf_3";
    const finalPlayers = isWolfGame ? shuffleArray(validPlayers) : validPlayers;

    // Build teams
    let finalTeams: string[][] = [];
    if (selectedGame?.isTeamGame) {
      const teamA = finalPlayers.filter((p, i) => teamAssignment[`player_${players.indexOf(p)}`] === "A" || teamAssignment[`player_${i}`] === "A");
      const teamB = finalPlayers.filter((p, i) => !teamA.includes(p));
      // Fallback: first half vs second half
      if (teamA.length === 0 || teamB.length === 0) {
        finalTeams = [finalPlayers.slice(0, 2), finalPlayers.slice(2)];
      } else {
        finalTeams = [teamA, teamB];
      }
    }

    const finalHandicaps: Record<string, number> = {};
    finalPlayers.forEach(p => { finalHandicaps[p] = handicaps[p] || 0; });

    createGameMutation.mutate({
      gameType: selectedGame?.id || "wolf",
      players: finalPlayers,
      teams: finalTeams,
      handicaps: finalHandicaps,
      tieCarryover: selectedGame?.carryover || false,
      courseName: courseQuery.trim(),
      pars,
      strokeIndexes: selectedGame?.needsHandicap ? strokeIndexes : Array.from({ length: 18 }, (_, i) => i + 1),
    });
  };

  const games = getGamesForPlayerCount(playerCount);
  const courses = searchData?.courses || [];
  const totalPar = pars.reduce((a, b) => a + b, 0);
  const front9Par = pars.slice(0, 9).reduce((a, b) => a + b, 0);
  const back9Par = pars.slice(9).reduce((a, b) => a + b, 0);

  // ── STEP 1: Player Count ──────────────────────────────────────────────────
  if (step === "count") {
    return (
      <div className="pt-6 pb-2 space-y-3">
        <div className="mb-5">
          <h2 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight">New Game</h2>
          <p className="text-sm text-muted-foreground mt-0.5">How many players?</p>
        </div>

        {PLAYER_COUNT_OPTIONS.map(opt => (
          <button
            key={opt.count}
            className="w-full flex items-center justify-between p-4 bg-card rounded-2xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-card hover:shadow-card-hover"
            onClick={() => handleSelectCount(opt.count)}
          >
            <div className="flex items-center gap-4">
              {/* Number badge */}
              <div className="w-12 h-12 rounded-xl bg-primary-700 dark:bg-primary-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-xl font-bold text-white leading-none">{opt.count}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-50 text-[0.9375rem]">{opt.label}</p>
                <p className="text-[0.8125rem] text-muted-foreground mt-0.5 leading-snug">{opt.desc}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-primary-300 dark:text-primary-500 group-hover:text-primary-600 flex-shrink-0 transition-colors" />
          </button>
        ))}
      </div>
    );
  }

  // ── STEP 2: Game Selection ────────────────────────────────────────────────
  if (step === "game") {
    return (
      <div className="pt-6 pb-2 space-y-3">
        {/* Header row */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setStep("count")}
            className="w-9 h-9 rounded-xl bg-card shadow-card flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Choose Game</h2>
            <p className="text-[0.8125rem] text-muted-foreground mt-1">{playerCount} players</p>
          </div>
        </div>

        {games.map(game => (
          <button
            key={game.id}
            className="w-full flex items-center justify-between p-4 bg-card rounded-2xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-card hover:shadow-card-hover"
            onClick={() => handleSelectGame(game)}
          >
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="font-semibold text-gray-900 dark:text-gray-50 text-[0.9375rem]">{game.name}</p>
                {game.isTeamGame && (
                  <span className="text-[0.6875rem] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800">Team</span>
                )}
                {game.needsHandicap && (
                  <span className="text-[0.6875rem] font-medium bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded-full border border-primary-100 dark:border-primary-800">Handicap</span>
                )}
              </div>
              <p className="text-[0.8125rem] text-muted-foreground leading-snug">{game.description}</p>
            </div>
            <ChevronRight className="w-4.5 h-4.5 text-primary-300 dark:text-primary-500 group-hover:text-primary-600 flex-shrink-0 transition-colors" />
          </button>
        ))}
      </div>
    );
  }

  // ── STEP 3: Player Names, Handicaps, Teams, Course ────────────────────────
  return (
    <div className="pt-6 pb-2 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => setStep("game")}
          className="w-9 h-9 rounded-xl bg-card shadow-card flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h2 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight leading-none">{selectedGame?.name}</h2>
          <p className="text-[0.8125rem] text-muted-foreground mt-1">{playerCount} players</p>
        </div>
      </div>

      {/* Game description hint */}
      <div className="p-3.5 bg-primary-50 dark:bg-primary-950/40 rounded-xl border border-primary-100 dark:border-primary-800/60">
        <p className="text-[0.8125rem] text-primary-800 dark:text-primary-200 leading-relaxed">{selectedGame?.description}</p>
      </div>

      <div className="bg-card rounded-2xl shadow-card p-5 space-y-5">

          {/* Course Search */}
          <div className="mb-5" ref={dropdownRef}>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Golf Course <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search for a course to auto-fill pars..."
                value={courseQuery}
                onChange={(e) => {
                  setCourseQuery(e.target.value);
                  if (selectedCourse) setSelectedCourse(null);
                  setShowDropdown(true);
                }}
                onFocus={() => { if (!selectedCourse && courseQuery.length >= 2) setShowDropdown(true); }}
                className={`pl-9 pr-8 ${selectedCourse ? "border-green-500" : ""}`}
              />
              {loadingCourse && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" />}
              {selectedCourse && !loadingCourse && (
                <button onClick={() => { setSelectedCourse(null); setCourseQuery(""); setPars([...DEFAULT_PARS]); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {showDropdown && !selectedCourse && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden max-w-sm">
                {isSearching ? (
                  <div className="flex items-center space-x-2 px-4 py-3 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Searching...</span>
                  </div>
                ) : courses.length > 0 ? courses.map((course) => (
                  <button key={course.id} type="button" onClick={() => handleSelectCourse(course)}
                    className="w-full flex items-start space-x-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{course.name}</p>
                      <p className="text-xs text-gray-500">{course.city}, {course.state}{course.par ? ` · Par ${course.par}` : ""}</p>
                    </div>
                  </button>
                )) : debouncedQuery.length >= 2 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">No courses found</div>
                ) : null}
              </div>
            )}
            {selectedCourse && !loadingCourse && (
              <div className="mt-2 flex items-center space-x-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span>{selectedCourse.city}, {selectedCourse.state} · scorecard loaded</span>
              </div>
            )}
          </div>

          {/* Player Names */}
          <div className="space-y-3 mb-5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Player Names</p>
            {players.slice(0, playerCount).map((player, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-primary-50 dark:bg-primary-950 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-700 dark:text-primary-300 font-medium text-sm">{index + 1}</span>
                </div>
                <Input
                  type="text"
                  placeholder={`Player ${index + 1} Name`}
                  value={player}
                  onChange={(e) => {
                    const newPlayers = [...players];
                    newPlayers[index] = e.target.value;
                    setPlayers(newPlayers);
                  }}
                  className="flex-1"
                />
                {/* Team toggle for team games */}
                {selectedGame?.isTeamGame && (
                  <button
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold border-2 transition-colors ${
                      (teamAssignment[`player_${index}`] || (index < playerCount / 2 ? "A" : "B")) === "A"
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                        : "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300"
                    }`}
                    onClick={() => setTeamAssignment(prev => ({
                      ...prev,
                      [`player_${index}`]: (prev[`player_${index}`] || (index < playerCount / 2 ? "A" : "B")) === "A" ? "B" : "A"
                    }))}
                  >
                    {(teamAssignment[`player_${index}`] || (index < playerCount / 2 ? "A" : "B")) === "A" ? "Team A" : "Team B"}
                  </button>
                )}
                {/* Handicap input for handicap games */}
                {selectedGame?.needsHandicap && (
                  <div className="flex-shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="54"
                      placeholder="Hdcp"
                      value={handicaps[player] ?? ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setHandicaps(prev => ({ ...prev, [player]: isNaN(val) ? 0 : val }));
                      }}
                      className="w-16 text-center text-sm"
                    />
                  </div>
                )}
              </div>
            ))}
            {selectedGame?.needsHandicap && (
              <p className="text-xs text-gray-400 ml-12">Handicap index (0 = scratch). Used to calculate net scores.</p>
            )}
            {selectedGame?.isTeamGame && (
              <p className="text-xs text-gray-400 ml-12">Tap Team A/B to reassign players to teams.</p>
            )}
          </div>

          {/* Wolf note */}
          {(selectedGame?.id === "wolf" || selectedGame?.id === "wolf_3") && (
            <div className="mb-5 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                🎲 Player order will be randomized for Wolf rotation
              </p>
            </div>
          )}

          {/* Par Setup */}
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4 text-left"
            onClick={() => setShowParSetup(v => !v)}
          >
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hole Par Values</span>
              <p className="text-xs text-gray-500 mt-0.5">Front: {front9Par} · Back: {back9Par} · Total: {totalPar}</p>
            </div>
            {showParSetup ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>

          {showParSetup && (
            <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">{selectedCourse ? "Auto-filled — edit if needed" : "Par 3, 4, or 5 per hole"}</p>
                <button onClick={() => setPars([...DEFAULT_PARS])} className="text-xs text-primary-600 hover:underline">Reset all to 4</button>
              </div>
              {["Front 9", "Back 9"].map((label, half) => (
                <div key={label}>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">{label}</p>
                  <div className="grid grid-cols-9 gap-1">
                    {pars.slice(half * 9, half * 9 + 9).map((par, i) => (
                      <div key={i} className="text-center">
                        <p className="text-xs text-gray-400 mb-1">{i + 1 + half * 9}</p>
                        <Input
                          type="number" min="3" max="5" value={par}
                          onChange={(e) => {
                            const parsed = parseInt(e.target.value);
                            if (!isNaN(parsed) && parsed >= 3 && parsed <= 5) {
                              const newPars = [...pars];
                              newPars[i + half * 9] = parsed;
                              setPars(newPars);
                            }
                          }}
                          className="w-full text-center p-1 text-sm h-8"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stroke Index — only shown for handicap games */}
          {selectedGame?.needsHandicap && (
            <>
              {/* Warning when using default (uncustomised) HCP ranks */}
              {hcpRanksSource === "default" && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">HCP ranks not set.</span> Search for your course above to auto-fill them, or enter them manually below. Without correct HCP ranks, strokes will be awarded on holes 1–4 by default instead of the actual hardest holes.
                </div>
              )}

              <button
                type="button"
                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4 text-left"
                onClick={() => setShowSISetup(v => !v)}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hole HCP Rankings</span>
                    {hcpRanksSource === "course" && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-medium">Auto-filled from course</span>
                    )}
                    {hcpRanksSource === "manual" && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-medium">Manual</span>
                    )}
                    {hcpRanksSource === "default" && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-medium">Not set</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">HCP 1 = hardest hole · determines which holes strokes are given on</p>
                </div>
                {showSISetup ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>

              {showSISetup && (
                <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Match the HCP column on your scorecard. HCP 1 = hardest, HCP 18 = easiest.</p>
                    <button
                      onClick={() => { setStrokeIndexes(Array.from({ length: 18 }, (_, i) => i + 1)); setHcpRanksSource("default"); }}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      Reset
                    </button>
                  </div>
                  {["Front 9", "Back 9"].map((label, half) => (
                    <div key={label}>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">{label}</p>
                      <div className="grid grid-cols-9 gap-1">
                        {strokeIndexes.slice(half * 9, half * 9 + 9).map((si, i) => (
                          <div key={i} className="text-center">
                            <p className="text-xs text-gray-400 mb-1">{i + 1 + half * 9}</p>
                            <Input
                              type="number" min="1" max="18" value={si}
                              onChange={(e) => {
                                const parsed = parseInt(e.target.value);
                                if (!isNaN(parsed) && parsed >= 1 && parsed <= 18) {
                                  const newSI = [...strokeIndexes];
                                  newSI[i + half * 9] = parsed;
                                  setStrokeIndexes(newSI);
                                  setHcpRanksSource("manual");
                                }
                              }}
                              className="w-full text-center p-1 text-sm h-8"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <Button
            className="w-full bg-primary-700 hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700 text-white py-3 rounded-xl font-semibold text-[0.9375rem] shadow-sm"
            onClick={handleStartGame}
            disabled={createGameMutation.isPending || loadingCourse}
            data-testid="button-start-game"
          >
            {createGameMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Game...</>
            ) : (
              `Start ${selectedGame?.name || "Game"}`
            )}
          </Button>
        </div>
    </div>
  );
}
