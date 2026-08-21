import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2, ChevronDown, ChevronUp, CheckCircle, MapPin, Search, X,
  Users, ChevronRight, ArrowLeft, Shuffle, UserCircle, Sparkles, DollarSign, Bookmark
} from "lucide-react";
import { getGamesForPlayerCount, getMiniGamesForSetup, isLowerBetter, type GameDef, type MiniGameDef } from "@/lib/game-logic";
import { presetToConfig } from "@/lib/preset-mappings";
import { validateGameConfig } from "@/lib/config-validator";
import { trackGame } from "@/lib/game-recovery";
import TeamSetup from "@/components/team-setup";
import CustomGameModal from "@/components/custom-game-modal";

interface GameSetupProps {
  onGameCreated: (gameId: string) => void;
  onStepChange?: (step: Step) => void;
}

interface CourseResult {
  id: string;
  name: string;
  city: string;
  state: string;
  country?: string;
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

// ── Universal Customization Constants ─────────────────────────────────────────

/** Games that support pressing (double-down mechanics) */
const PRESS_ELIGIBLE_GAMES = [
  "wolf", "wolf_3", "match_play", "nassau", "best_ball_2", "best_ball_4", "hammer", "vegas",
];

/** Games where carryover (tied holes push forward) is relevant */
const CARRYOVER_GAMES = [
  "skins", "wolf", "wolf_3", "match_play", "nassau", "best_ball_2", "best_ball_4",
];

/** Games that support net/gross toggle (play with or without handicaps) */
const NET_GROSS_TOGGLE_GAMES = [
  "skins", "match_play", "nassau", "best_ball_2", "best_ball_4", "stableford", "quota", "nine_point",
];

/** Games with multi-segment betting (Nassau-style front/back/overall) */
const SEGMENT_GAMES = ["nassau", "match_play"];

type Step = "count" | "game" | "players" | "minigames";

const PLAYER_COUNT_OPTIONS = [
  { count: 2, label: "2 Players", desc: "Match Play, Skins, Nassau & more" },
  { count: 3, label: "3 Players", desc: "Wolf, Sixes, Bingo Bango Bongo" },
  { count: 4, label: "4 Players", desc: "Wolf, Scramble, Vegas & more" },
  { count: 5, label: "5 Players", desc: "Stroke Play, Skins, Scramble & more" },
  { count: 6, label: "6+ Players", desc: "Large group or tournament" },
];

export default function GameSetup({ onGameCreated, onStepChange }: GameSetupProps) {
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
  const [showGroupPrompt, setShowGroupPrompt] = useState(false);
  const [customPlayerCount, setCustomPlayerCount] = useState(6);
  const [showCustomGameModal, setShowCustomGameModal] = useState(false);
  const [selectedMiniGames, setSelectedMiniGames] = useState<Record<string, { enabled: boolean; value: number }>>({});
  const [expandedGameInfo, setExpandedGameInfo] = useState<string | null>(null);
  const [gameSettings, setGameSettings] = useState<Record<string, any>>({});
  const [useHandicap, setUseHandicap] = useState(false);
  const [pressSettings, setPressSettings] = useState({
    enabled: false,
    maxPerHole: 3,
    whoCanPress: "anyone" as "anyone" | "losing_only",
    autoPress: false,
  });
  const [multiTeamNames, setMultiTeamNames] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Notify parent when step changes (so home page can hide sections during active setup)
  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // Self-removal from Player 1 slot
  const [selfRemoved, setSelfRemoved] = useState(false);

  // Per-player autocomplete
  const [playerSearchText, setPlayerSearchText] = useState<Record<number, string>>({});

  // ── Game Templates ──
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["/api/game-templates"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/game-templates", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/game-templates", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Template saved", description: "You can load it next time you create a game" });
    },
  });
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [debouncedPlayerSearch, setDebouncedPlayerSearch] = useState("");
  const playerDropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Fetch favorites (includes handicapIndex from server)
  const { data: favoritesData } = useQuery<{ favoriteName: string; handicapIndex: number | null }[]>({
    queryKey: ["/api/auth/favorites"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/auth/favorites", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Build a lookup: name → handicap for auto-fill
  const handicapLookup = useRef<Record<string, number>>({});

  // Populate lookup from auth user + favorites
  useEffect(() => {
    const lookup: Record<string, number> = {};
    // Logged-in user's own handicap
    if (user?.name && user.handicapIndex != null) {
      lookup[user.name.toLowerCase()] = user.handicapIndex;
    }
    // Favorites' handicaps
    if (favoritesData) {
      for (const fav of favoritesData) {
        if (fav.handicapIndex != null) {
          lookup[fav.favoriteName.toLowerCase()] = fav.handicapIndex;
        }
      }
    }
    handicapLookup.current = lookup;
  }, [user, favoritesData]);

  // Auto-fill handicap when player name changes
  useEffect(() => {
    const updated = { ...handicaps };
    let changed = false;
    for (let i = 0; i < playerCount; i++) {
      const name = players[i]?.trim();
      if (!name) continue;
      // Don't overwrite a manually-set handicap
      if (handicaps[name] !== undefined && handicaps[name] !== 0) continue;
      const autoHcp = handicapLookup.current[name.toLowerCase()];
      if (autoHcp !== undefined) {
        updated[name] = autoHcp;
        changed = true;
      }
    }
    if (changed) setHandicaps(updated);
  }, [players, playerCount]);

  // Auto-fill Player 1 with logged-in user
  useEffect(() => {
    if (step === "players" && user && !selfRemoved) {
      setPlayers(prev => {
        const updated = [...prev];
        if (!updated[0]) {
          updated[0] = user.name;
        }
        return updated;
      });
      if (user.handicapIndex != null) {
        const hcp = user.handicapIndex;
        setHandicaps(prev => ({ ...prev, [user.name]: hcp }));
      }
    }
  }, [step, user, selfRemoved]);

  // Debounce player search for autocomplete
  useEffect(() => {
    if (activeDropdown === null) return;
    const query = playerSearchText[activeDropdown] || "";
    const timer = setTimeout(() => setDebouncedPlayerSearch(query), 300);
    return () => clearTimeout(timer);
  }, [playerSearchText, activeDropdown]);

  // Close player dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (activeDropdown === null) return;
      const ref = playerDropdownRefs.current[activeDropdown];
      if (ref && !ref.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activeDropdown]);

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

  // User search for player autocomplete
  interface UserSearchResult {
    id: number;
    name: string;
    avatarUrl: string | null;
    handicapIndex: number | null;
  }

  const { data: userSearchResults = [] } = useQuery<UserSearchResult[]>({
    queryKey: ["/api/auth/search-users", debouncedPlayerSearch],
    enabled: debouncedPlayerSearch.length >= 1 && activeDropdown !== null,
    queryFn: async () => {
      const res = await fetch(`/api/auth/search-users?q=${encodeURIComponent(debouncedPlayerSearch)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
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
      // Data quality check — if pars total doesn't match claimed course par, warn and auto-expand editor
      const parsTotal = (detail.pars || []).reduce((a: number, b: number) => a + b, 0);
      const coursePar = detail.par || 0;
      if (coursePar > 0 && Math.abs(parsTotal - coursePar) > 1) {
        setShowParSetup(true);
        setShowSISetup(true);
        toast({
          title: "Scorecard data may be wrong",
          description: `Hole pars add up to ${parsTotal} but course says par ${coursePar}. Check and correct below before starting.`,
          variant: "destructive",
        });
      } else {
        const hcpNote = detail.hcpRanks
          ? " · HCP ranks auto-filled"
          : " · HCP ranks not available — enter them manually below";
        toast({ title: "Course loaded!", description: `${detail.name} — Par ${detail.par}${hcpNote}` });
      }
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
    onSuccess: (game) => {
      // Track in localStorage for guest recovery
      trackGame({
        id: game.id,
        gameType: game.gameType,
        players: game.players,
        courseName: game.courseName,
        currentHole: 1,
        active: true,
      });
      onGameCreated(game.id);
    },
    onError: (error) => {
      toast({ title: "Error", description: (error as Error).message || "Failed to create game", variant: "destructive" });
    },
  });

  const handleSelectCount = (count: number) => {
    if (count >= 6) {
      setShowGroupPrompt(true);
      return;
    }
    setPlayerCount(count);
    setPlayers(prev => {
      const next = [...prev];
      while (next.length < count) next.push("");
      return next;
    });
    setSelectedGame(null);
    setSelfRemoved(false);
    setStep("game");
  };

  const handleConfirmLargeGroup = (confirmedCount: number) => {
    setShowGroupPrompt(false);
    setPlayerCount(confirmedCount);
    setPlayers(prev => {
      const next = [...prev];
      while (next.length < confirmedCount) next.push("");
      return next;
    });
    setSelectedGame(null);
    setSelfRemoved(false);
    setStep("game");
  };

  // ── Custom format (via chat modal) ──
  // Modal calls this with the confirmed config — never silently builds
  const handleStartCustomGame = (config: any) => {
    if (!config) return;
    setShowCustomGameModal(false);
    // Create a pseudo GameDef from the parsed config
    const customGame: GameDef = {
      id: config.id || "custom",
      name: config.name || "Custom Game",
      description: config.description || "Custom format",
      playerCounts: [playerCount],
      isTeamGame: config.teamStructure?.type === "teams",
      needsHandicap: !!config.needsHandicap,
      carryover: !!config.carryover,
      customizable: false,
    };
    setSelectedGame(customGame);
    setGameSettings(prev => ({ ...prev, customGameConfig: config }));
    setUseHandicap(!!config.needsHandicap);
    // Pre-select any mini-games the LLM included in the config
    if (config.miniGames?.length > 0) {
      const preSelected: Record<string, { enabled: boolean; value: number }> = {};
      config.miniGames.forEach((mg: any) => {
        const id = mg.id || mg.name?.toLowerCase().replace(/\s+/g, "_");
        if (id) {
          preSelected[id] = { enabled: true, value: mg.value || 5 };
        }
      });
      setSelectedMiniGames(prev => ({ ...preSelected, ...prev }));
    }
    setStep("players");
  };

  // Handle preset selection from custom game modal (Tier 1 — exact preset match)
  const handlePresetSelect = (presetId: string) => {
    setShowCustomGameModal(false);
    const gameDef = getGamesForPlayerCount(playerCount).find(g => g.id === presetId);
    if (gameDef) {
      handleSelectGame(gameDef);
    } else {
      // Preset may not exist for this player count — fall back to custom
      const fallbackConfig = presetToConfig({ gameType: presetId, playerNames: players.map((p, i) => p || `Player ${i + 1}`), teams: [] });
      handleStartCustomGame(fallbackConfig);
    }
  };

  const handleSelectGame = (game: GameDef) => {
    setSelectedGame(game);
    setGameSettings({});
    setExpandedGameInfo(null);
    setUseHandicap(!!game.needsHandicap);
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

    // Handicap validation — ALL players must have handicap entered if toggle is on
    if (useHandicap) {
      const missingHdcp = validPlayers.filter(p => handicaps[p] == null || handicaps[p] === 0);
      if (missingHdcp.length > 0) {
        toast({
          title: "Handicaps required",
          description: `${missingHdcp.length} player${missingHdcp.length > 1 ? "s" : ""} missing handicap index (${missingHdcp.map(n => n.split(" ")[0]).join(", ")}). Enter all handicaps or turn off Handicap Play.`,
          variant: "destructive",
        });
        return;
      }
    }

    // For wolf-style games, randomize order
    const isWolfGame = selectedGame?.id === "wolf" || selectedGame?.id === "wolf_3";
    const finalPlayers = isWolfGame ? shuffleArray(validPlayers) : validPlayers;

    // Build teams
    let finalTeams: string[][] = [];
    if (selectedGame?.isTeamGame) {
      if (["team_best_ball", "team_scramble"].includes(selectedGame.id)) {
        // Multi-team games: use TeamSetup output
        finalTeams = teams.filter(t => t.length > 0);
        if (finalTeams.length < 2) {
          toast({ title: "Assign teams", description: "Set up at least 2 teams before starting", variant: "destructive" });
          return;
        }
      } else {
        const teamA = finalPlayers.filter((p, i) => teamAssignment[`player_${players.indexOf(p)}`] === "A" || teamAssignment[`player_${i}`] === "A");
        const teamB = finalPlayers.filter((p, i) => !teamA.includes(p));
        // Fallback: first half vs second half
        if (teamA.length === 0 || teamB.length === 0) {
          finalTeams = [finalPlayers.slice(0, 2), finalPlayers.slice(2)];
        } else {
          finalTeams = [teamA, teamB];
        }
      }
    }

    const finalHandicaps: Record<string, number> = {};
    finalPlayers.forEach(p => { finalHandicaps[p] = handicaps[p] || 0; });

    // ── Generate GameConfig ──
    // For custom LLM-parsed configs, use the parsed config directly
    // For preset games, generate config via presetToConfig()
    const gameConfig = gameSettings.customGameConfig
      ? gameSettings.customGameConfig
      : presetToConfig({
          gameType: selectedGame?.id || "wolf",
          playerNames: finalPlayers,
          teams: finalTeams,
        });

    // ── Validate game config before starting ──
    if (!gameConfig) {
      toast({
        title: "Invalid game config",
        description: "Could not build a valid game configuration. Try selecting a different game type.",
        variant: "destructive",
      });
      return;
    }
    const validation = validateGameConfig(gameConfig);
    if (!validation.valid) {
      if (validation.warnings.length > 0) {
        console.warn("Game config warnings:", validation.warnings);
      }
      toast({
        title: "Game config has errors",
        description: validation.errors.join(" · "),
        variant: "destructive",
      });
      return;
    }

    createGameMutation.mutate({
      gameType: selectedGame?.id || "custom",
      players: finalPlayers,
      teams: finalTeams,
      handicaps: finalHandicaps,
      tieCarryover: selectedGame?.carryover || false,
      courseName: courseQuery.trim(),
      pars,
      strokeIndexes: useHandicap ? strokeIndexes : Array.from({ length: 18 }, (_, i) => i + 1),
      miniGames: selectedMiniGames,
      gameSettings: { ...gameSettings, useHandicap, ...(pressSettings.enabled ? { pressRules: pressSettings } : {}), ...(multiTeamNames.length > 0 ? { teamNames: multiTeamNames } : {}) },
      gameConfig: gameConfig || {},
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
          <h2 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight font-display">New Game</h2>
          <p className="text-sm text-muted-foreground mt-0.5">How many players?</p>
        </div>

        {PLAYER_COUNT_OPTIONS.map(opt => (
          <button
            key={opt.count}
            className="w-full flex items-center justify-between p-4 bg-card rounded-xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-card hover:shadow-card-hover"
            onClick={() => handleSelectCount(opt.count)}
          >
            <div className="flex items-center gap-4">
              {/* Number badge */}
              <div className="w-12 h-12 rounded-lg bg-secondary-500 flex items-center justify-center flex-shrink-0 shadow-sm">
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

        {/* Saved templates */}
        {user && templates.length > 0 && (
          <div className="pt-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Bookmark className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saved Templates</span>
            </div>
            {templates.map(tpl => (
              <button
                key={tpl.id}
                className="w-full flex items-center justify-between p-3 mb-2 bg-secondary-50 dark:bg-gray-800/50 rounded-lg text-left transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
                onClick={() => {
                  setPlayerCount(tpl.playerCount);
                  const gameDef = getGamesForPlayerCount(tpl.playerCount).find(g => g.id === tpl.gameType);
                  if (gameDef) {
                    setSelectedGame(gameDef);
                    setStep("players");
                  } else {
                    // Game type may not exist for this count, go to game selection
                    handleSelectCount(tpl.playerCount);
                  }
                  if (tpl.defaultHandicaps) setHandicaps(tpl.defaultHandicaps);
                  if (tpl.defaultMiniGames) setSelectedMiniGames(tpl.defaultMiniGames);
                  if (tpl.defaultGameSettings) setGameSettings(tpl.defaultGameSettings);
                  toast({ title: `Loaded "${tpl.name}"`, description: "Adjust names and start" });
                }}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-900 dark:text-gray-50 truncate">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {tpl.gameType} · {tpl.playerCount} players
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* Large group prompt modal */}
        {showGroupPrompt && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={() => setShowGroupPrompt(false)}>
            <div className="bg-card rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50">Large Group Detected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  For groups of 6 or more, a tournament or group game provides better scoring, team management, and multiple bet pools.
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Number of Players</label>
                <input
                  type="number"
                  min={6}
                  max={144}
                  value={customPlayerCount}
                  onChange={e => setCustomPlayerCount(Math.max(6, Math.min(144, parseInt(e.target.value) || 6)))}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-50"
                />
              </div>
              <div className="space-y-2">
                <button
                  className="w-full py-3 bg-primary-600 text-white rounded-xl font-semibold text-sm active:scale-[0.98]"
                  onClick={() => handleConfirmLargeGroup(customPlayerCount)}
                >
                  Continue as Regular Round ({customPlayerCount} players)
                </button>
                <button
                  className="w-full py-3 bg-secondary-500 text-white rounded-xl font-semibold text-sm active:scale-[0.98]"
                  onClick={() => {
                    setShowGroupPrompt(false);
                    setLocation("/tournament/create");
                  }}
                >
                  Set Up Group Tournament
                </button>
                <button
                  className="w-full py-2 text-muted-foreground text-sm font-medium"
                  onClick={() => setShowGroupPrompt(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
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
            <h2 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight leading-none font-display">Choose Game</h2>
            <p className="text-[0.8125rem] text-muted-foreground mt-1">{playerCount} players</p>
          </div>
        </div>

        {games.map(game => (
          <div key={game.id} className="bg-card rounded-xl shadow-card overflow-hidden transition-all duration-200 hover:shadow-card-hover">
            <button
              className="w-full flex items-center justify-between p-4 text-left group active:scale-[0.98] transition-transform"
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
                  {game.customizable && (
                    <span className="text-[0.6875rem] font-medium bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-800">Customizable</span>
                  )}
                </div>
                <p className="text-[0.8125rem] text-muted-foreground leading-snug">{game.description}</p>
              </div>
              <ChevronRight className="w-4.5 h-4.5 text-primary-300 dark:text-primary-500 group-hover:text-primary-600 flex-shrink-0 transition-colors" />
            </button>
            {game.detailedDescription && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedGameInfo(expandedGameInfo === game.id ? null : game.id);
                }}
                className="w-full px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-left flex items-center justify-between"
              >
                <span className="text-[0.75rem] font-medium text-primary-600 dark:text-primary-400">How to Play</span>
                {expandedGameInfo === game.id ? (
                  <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                )}
              </button>
            )}
            {expandedGameInfo === game.id && game.detailedDescription && (
              <div className="px-4 pb-4 pt-1">
                <p className="text-[0.8125rem] text-gray-600 dark:text-gray-400 leading-relaxed">{game.detailedDescription}</p>
              </div>
            )}
          </div>
        ))}

        {/* Custom Game — AI-powered format builder */}
        <button
          onClick={() => setShowCustomGameModal(true)}
          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-card hover:shadow-card-hover"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-[0.9375rem]">Custom Game</p>
              <p className="text-[0.8125rem] text-violet-100 mt-0.5 leading-snug">Describe any format — AI builds it for you</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80 group-hover:text-white flex-shrink-0 transition-colors" />
        </button>

        {/* Custom Game Chat Modal */}
        {showCustomGameModal && (
          <CustomGameModal
            playerCount={playerCount}
            onClose={() => setShowCustomGameModal(false)}
            onConfirm={handleStartCustomGame}
            onPresetSelect={handlePresetSelect}
          />
        )}

      </div>
    );
  }

  // ── STEP 3: Player Names, Handicaps, Teams, Course ────────────────────────
  if (step === "players") {
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

      {/* ── STAKES — Dollar value per point / per hole ── */}
      {(() => {
        const gameId = selectedGame?.id || "stroke_play";
        const isStrokeBased = gameId === "stroke_play";
        const isHoleBased = ["skins", "match_play", "nassau"].includes(gameId);
        const label = isHoleBased ? "per hole" : isStrokeBased ? "buy-in" : "per point";
        return (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardContent className="p-3.5">
            <div className="flex items-center gap-2 mb-2.5">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
                Stakes
              </h3>
              <span className="text-[0.6875rem] text-muted-foreground ml-auto">{label}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 5, 10, 20].map(v => (
                <button
                  key={v}
                  className={`px-3 py-1.5 rounded-lg text-[0.8125rem] font-medium transition-all ${
                    gameSettings.pointValue === v
                      ? "bg-emerald-500 text-white shadow-sm"
                      : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900"
                  }`}
                  onClick={() => setGameSettings(prev => ({ ...prev, pointValue: v }))}
                >
                  ${v}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <span className="text-[0.75rem] text-muted-foreground">$</span>
                <Input
                  type="number"
                  min={0}
                  className="w-16 h-8 text-[0.8125rem]"
                  placeholder="0"
                  value={gameSettings.pointValue || ""}
                  onChange={e => setGameSettings(prev => ({ ...prev, pointValue: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            {(!gameSettings.pointValue || gameSettings.pointValue === 0) && (
              <p className="text-[0.6875rem] text-muted-foreground mt-2">Points only, no money. Set a value to track winnings.</p>
            )}
          </CardContent>
        </Card>
        );
      })()}

      {/* Multi-team setup for team_best_ball / team_scramble */}
      {selectedGame && ["team_best_ball", "team_scramble"].includes(selectedGame.id) && (
        <Card className="border-primary-200 dark:border-primary-800">
          <CardContent className="p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary-500" />
              <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
                {selectedGame.id === "team_scramble" ? "Scramble Teams" : "Best Ball Teams"}
              </h3>
            </div>
            <TeamSetup
              players={players.slice(0, playerCount).filter(p => p.trim() !== "")}
              handicaps={useHandicap ? handicaps : undefined}
              onTeamsChange={(newTeams, newNames) => {
                setTeams(newTeams);
                setMultiTeamNames(newNames);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Game-Specific Settings ─────────────────────────────────────────── */}

      {/* Wolf customization settings */}
      {selectedGame?.customizable && (selectedGame.id === "wolf" || selectedGame.id === "wolf_3" || selectedGame.id === "wolf_5") && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Wolf Settings</p>
          </div>
          {selectedGame.id === "wolf_5" && (
            <div className="space-y-3">
              <p className="text-[0.6875rem] text-gray-400">
                Fixed scoring: team hole +1.5/-1, Lone Wolf +4/-1, Blind Wolf +8/-2 (wolf alone vs all four, double points). Holes 1-15 rotate, 16-18 go to the three lowest — furthest back takes 18. Wolf always tees last. Set the per-point stake below.
              </p>
            </div>
          )}
          {selectedGame.id !== "wolf_5" && (<>
          {/* Wolf order: first or last */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Wolf hits</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGameSettings(prev => ({ ...prev, wolfOrder: "first" }))}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  (gameSettings.wolfOrder ?? "last") === "first"
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setGameSettings(prev => ({ ...prev, wolfOrder: "last" }))}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  (gameSettings.wolfOrder ?? "last") === "last"
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                Last
              </button>
            </div>
            <p className="text-[0.6875rem] text-gray-400 mt-1.5">
              {(gameSettings.wolfOrder ?? "last") === "first"
                ? "Wolf tees off first, then decides partner or solo before watching others."
                : "Wolf tees off last, watches all drives, then picks partner or goes solo."
              }
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Win alone (pts)</label>
              <Input
                type="number"
                defaultValue={3}
                min={1}
                max={10}
                className="h-9 text-sm"
                onChange={(e) => setGameSettings(prev => ({ ...prev, wolfWinAlone: parseInt(e.target.value) || 3 }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Win with partner (pts)</label>
              <Input
                type="number"
                defaultValue={1}
                min={1}
                max={10}
                className="h-9 text-sm"
                onChange={(e) => setGameSettings(prev => ({ ...prev, wolfWinTeam: parseInt(e.target.value) || 1 }))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Blind Wolf allowed</p>
              <p className="text-[0.6875rem] text-gray-400">Declare solo before anyone tees off — higher stakes</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, blindWolf: !prev.blindWolf }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${gameSettings.blindWolf ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${gameSettings.blindWolf ? "translate-x-4" : ""}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Carryover points</p>
              <p className="text-[0.6875rem] text-gray-400">Tied holes carry points forward</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, carryover: !prev.carryover }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${gameSettings.carryover ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${gameSettings.carryover ? "translate-x-4" : ""}`} />
            </button>
          </div>
          </>)}
        </div>
      )}

      {/* Nassau segment values */}
      {selectedGame?.id === "nassau" && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Nassau Segments</p>
          </div>
          <p className="text-[0.6875rem] text-gray-400">Set independent bet amounts for each segment of the round.</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Front 9</label>
              <div className="flex items-center gap-1">
                <span className="text-[0.75rem] text-muted-foreground">$</span>
                <Input
                  type="number"
                  defaultValue={5}
                  min={0}
                  className="h-9 text-sm"
                  onChange={(e) => setGameSettings(prev => ({ ...prev, nassauFront: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Back 9</label>
              <div className="flex items-center gap-1">
                <span className="text-[0.75rem] text-muted-foreground">$</span>
                <Input
                  type="number"
                  defaultValue={5}
                  min={0}
                  className="h-9 text-sm"
                  onChange={(e) => setGameSettings(prev => ({ ...prev, nassauBack: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Overall</label>
              <div className="flex items-center gap-1">
                <span className="text-[0.75rem] text-muted-foreground">$</span>
                <Input
                  type="number"
                  defaultValue={10}
                  min={0}
                  className="h-9 text-sm"
                  onChange={(e) => setGameSettings(prev => ({ ...prev, nassauTotal: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Auto-press at 2-down</p>
              <p className="text-[0.6875rem] text-gray-400">Automatically starts a new bet when a side goes 2 down</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, autoPress: !prev.autoPress }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${gameSettings.autoPress ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${gameSettings.autoPress ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Skins settings */}
      {selectedGame?.id === "skins" && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Skins Settings</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Carryover ties</p>
              <p className="text-[0.6875rem] text-gray-400">Tied holes push the pot to the next hole</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, carryover: prev.carryover === false ? true : !prev.carryover }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${(gameSettings.carryover ?? true) ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${(gameSettings.carryover ?? true) ? "translate-x-4" : ""}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Net skins (handicap)</p>
              <p className="text-[0.6875rem] text-gray-400">Use net scores instead of gross</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, netSkins: !prev.netSkins }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${gameSettings.netSkins ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${gameSettings.netSkins ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Stableford / Quota scoring table */}
      {(selectedGame?.id === "stableford" || selectedGame?.id === "quota") && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Point Table</p>
          </div>
          <p className="text-[0.6875rem] text-gray-400">Points awarded based on score relative to par. Adjust to match your group's rules.</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "dblbogey", label: "Double Bogey+", default: -3 },
              { key: "bogey", label: "Bogey", default: 1 },
              { key: "par", label: "Par", default: 2 },
              { key: "birdie", label: "Birdie", default: 3 },
              { key: "eagle", label: "Eagle", default: 4 },
              { key: "dbeagle", label: "Double Eagle+", default: 5 },
            ].map(pt => (
              <div key={pt.key} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">{pt.label}</span>
                <Input
                  type="number"
                  defaultValue={pt.default}
                  className="w-14 h-9 text-sm text-center"
                  onChange={(e) => setGameSettings(prev => ({
                    ...prev,
                    pointTable: { ...(prev.pointTable || {}), [pt.key]: parseInt(e.target.value) || pt.default },
                  }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9-Point distribution */}
      {selectedGame?.id === "nine_point" && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Points Distribution</p>
          </div>
          <p className="text-[0.6875rem] text-gray-400">How the 9 points per hole are split by finishing position.</p>
          <div className="flex gap-2">
            {[
              { label: "5 / 3 / 1", value: "531", desc: "Standard" },
              { label: "6 / 2 / 1", value: "621", desc: "Top-heavy" },
              { label: "4 / 3 / 2", value: "432", desc: "Balanced" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setGameSettings(prev => ({ ...prev, ninePointDist: opt.value }))}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  (gameSettings.ninePointDist ?? "531") === opt.value
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                <div className="font-semibold">{opt.label}</div>
                <div className="text-[0.625rem] opacity-70 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Best Ball counting scores */}
      {(selectedGame?.id === "best_ball_2" || selectedGame?.id === "best_ball_4") && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Counting Scores</p>
          </div>
          <p className="text-[0.6875rem] text-gray-400">Which scores count toward your team total each hole.</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "1 Low Ball", value: "1low" },
              { label: "2 Low Balls", value: "2low" },
              { label: "1 Low Net + 1 Low Gross", value: "1net1gross" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setGameSettings(prev => ({ ...prev, countingScores: opt.value }))}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  (gameSettings.countingScores ?? "1low") === opt.value
                    ? "bg-primary-500 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vegas settings */}
      {selectedGame?.id === "vegas" && (
        <div className="bg-card rounded-xl shadow-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Vegas Settings</p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Flip rule (10+ flips digits)</p>
              <p className="text-[0.6875rem] text-gray-400">If a player shoots 10+, the digits flip (4 and 10 = 104, not 410)</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, vegasFlip: !prev.vegasFlip }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${gameSettings.vegasFlip ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${gameSettings.vegasFlip ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* Match Play / Stroke Play / Hammer / Par-Birdie: carryover toggle */}
      {["match_play", "hammer"].includes(selectedGame?.id || "") && (
        <div className="bg-card rounded-xl shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Carryover</p>
              <p className="text-[0.6875rem] text-gray-400">Tied holes carry points forward to the next</p>
            </div>
            <button
              onClick={() => setGameSettings(prev => ({ ...prev, carryover: !prev.carryover }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${gameSettings.carryover ? "bg-primary-500" : "bg-gray-300 dark:bg-gray-700"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${gameSettings.carryover ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </div>
      )}

      {/* ── Universal Pressing Rules ── */}
      {PRESS_ELIGIBLE_GAMES.includes(selectedGame?.id || "") && (
        <Card className="border-violet-200 dark:border-violet-800">
          <CardContent className="p-3.5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h3 className="text-[0.9375rem] font-semibold text-gray-800 dark:text-gray-200 leading-none">
                Pressing Rules
              </h3>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Allow pressing</p>
                <p className="text-[0.6875rem] text-gray-400">Double down on a hole — opponent must accept or concede</p>
              </div>
              <button
                onClick={() => setPressSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative w-10 h-6 rounded-full transition-colors ${pressSettings.enabled ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${pressSettings.enabled ? "translate-x-4" : ""}`} />
              </button>
            </div>
            {pressSettings.enabled && (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Max presses per hole</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 99].map(n => (
                      <button
                        key={n}
                        onClick={() => setPressSettings(prev => ({ ...prev, maxPerHole: n }))}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          pressSettings.maxPerHole === n
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {n === 99 ? "Unlimited" : n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Who can press</p>
                  <div className="flex gap-2">
                    {[
                      { label: "Anyone", value: "anyone" },
                      { label: "Losing side only", value: "losing_only" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setPressSettings(prev => ({ ...prev, whoCanPress: opt.value as "anyone" | "losing_only" }))}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          pressSettings.whoCanPress === opt.value
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {SEGMENT_GAMES.includes(selectedGame?.id || "") && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Auto-press at 2-down</p>
                      <p className="text-[0.6875rem] text-gray-400">Start a new bet automatically when a side goes 2 down</p>
                    </div>
                    <button
                      onClick={() => setPressSettings(prev => ({ ...prev, autoPress: !prev.autoPress }))}
                      className={`relative w-10 h-6 rounded-full transition-colors ${pressSettings.autoPress ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-700"}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${pressSettings.autoPress ? "translate-x-4" : ""}`} />
                    </button>
                  </div>
                )}
                <p className="text-[0.6875rem] text-violet-400">
                  Multiplier: 2x per press (1 press = 2x, 2 presses = 4x, 3 presses = 8x)
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="bg-card rounded-xl shadow-card p-5 space-y-5">

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
                      <p className="text-xs text-gray-500">
                        {[course.city, course.state, course.country].filter(Boolean).join(", ")}{course.par ? ` · Par ${course.par}` : course.id?.startsWith("osm-") ? " · No scorecard" : ""}
                      </p>
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
                <span>{[selectedCourse.city, selectedCourse.state].filter(Boolean).join(", ") || "Course"} · scorecard loaded</span>
              </div>
            )}
          </div>

          {/* Player Names */}
          <div className="space-y-3 mb-5">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Player Names</p>
            {players.slice(0, playerCount).map((player, index) => {
              const isSelf = !!(user && index === 0 && player === user.name && !selfRemoved);
              const autoHcp = player.trim() ? handicapLookup.current[player.trim().toLowerCase()] : undefined;
              const hasAutoHcp = autoHcp !== undefined && handicaps[player] === autoHcp;
              const showUserDropdown = activeDropdown === index && !isSelf && player.length >= 1 && userSearchResults.length > 0;

              return (
                <div key={index} className="relative" ref={el => { playerDropdownRefs.current[index] = el; }}>
                  <div className="flex items-center space-x-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isSelf
                        ? "bg-primary-100 dark:bg-primary-900/40"
                        : "bg-primary-50 dark:bg-primary-950"
                    }`}>
                      {isSelf ? (
                        <UserCircle className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                      ) : (
                        <span className="text-primary-700 dark:text-primary-300 font-medium text-sm">{index + 1}</span>
                      )}
                    </div>
                    <div className="flex-1 relative">
                      <Input
                        type="text"
                        placeholder={`Player ${index + 1} Name`}
                        value={player}
                        onChange={(e) => {
                          const newPlayers = [...players];
                          newPlayers[index] = e.target.value;
                          setPlayers(newPlayers);
                          if (isSelf) {
                            setSelfRemoved(true);
                          } else {
                            setPlayerSearchText(prev => ({ ...prev, [index]: e.target.value }));
                            setActiveDropdown(index);
                          }
                        }}
                        onFocus={() => {
                          if (!isSelf && player.length >= 1) {
                            setPlayerSearchText(prev => ({ ...prev, [index]: player }));
                            setActiveDropdown(index);
                          }
                        }}
                        className={`flex-1 ${isSelf ? "border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 pr-16" : ""}`}
                      />
                      {isSelf && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                          <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-primary-200/60 dark:bg-primary-800/40 text-primary-700 dark:text-primary-300 font-semibold uppercase tracking-wide">You</span>
                          <button
                            onClick={() => {
                              const newPlayers = [...players];
                              newPlayers[0] = "";
                              setPlayers(newPlayers);
                              setSelfRemoved(true);
                              if (user?.name) {
                                setHandicaps(prev => {
                                  const updated = { ...prev };
                                  delete updated[user.name];
                                  return updated;
                                });
                              }
                            }}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Team toggle for team games (not multi-team games) */}
                    {selectedGame?.isTeamGame && !["team_best_ball", "team_scramble"].includes(selectedGame.id) && (
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
                    {/* Handicap input — shown when handicap play is on */}
                    {useHandicap && (
                      <div className="flex-shrink-0 relative">
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
                          className={`w-16 text-center text-sm ${hasAutoHcp ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20" : ""} ${(handicaps[player] == null || handicaps[player] === 0) ? "border-red-300 dark:border-red-700" : ""}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* User autocomplete dropdown */}
                  {showUserDropdown && (
                    <div className="absolute z-20 left-12 mt-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden" style={{ right: '4.5rem' }}>
                      {userSearchResults.map(u => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full flex items-center space-x-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-b border-gray-100 dark:border-gray-700 last:border-0"
                          onClick={() => {
                            const newPlayers = [...players];
                            newPlayers[index] = u.name;
                            setPlayers(newPlayers);
                            if (u.handicapIndex != null) {
                              setHandicaps(prev => ({ ...prev, [u.name]: u.handicapIndex! }));
                            }
                            setActiveDropdown(null);
                            setPlayerSearchText(prev => ({ ...prev, [index]: "" }));
                          }}
                        >
                          {u.avatarUrl && !u.avatarUrl.startsWith("data:") ? (
                            <img src={u.avatarUrl} className="w-7 h-7 rounded-full object-cover flex-shrink-0" alt="" />
                          ) : (
                            <div className="w-7 h-7 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-gray-500">{u.name.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{u.name}</p>
                            {u.handicapIndex != null ? (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400">Hdcp: {u.handicapIndex}</p>
                            ) : (
                              <p className="text-xs text-gray-400">No handicap set</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-gray-400 ml-12">
              {useHandicap
                ? "Handicap index for each player. Strokes are awarded on the hardest holes. "
                : "Handicap index (0 = scratch). "}
              {user?.handicapIndex != null && <span className="text-emerald-500">Green = auto-filled from profile. </span>}
              {user && <span className="text-primary-500">Start typing a name to search PinPlay users. </span>}
            </p>
            {selectedGame?.isTeamGame && (
              <p className="text-xs text-gray-400 ml-12">Tap Team A/B to reassign players to teams.</p>
            )}
          </div>

          {/* Wolf note */}
          {(selectedGame?.id === "wolf" || selectedGame?.id === "wolf_3") && (
            <div className="mb-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                🎲 Player order will be randomized for Wolf rotation
              </p>
            </div>
          )}

          {/* Handicap Play toggle */}
          <button
            type="button"
            onClick={() => setUseHandicap(v => !v)}
            className={`w-full flex items-center justify-between p-4 rounded-lg mb-4 text-left transition-colors ${
              useHandicap
                ? "bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-300 dark:border-blue-700"
                : "bg-gray-50 dark:bg-gray-800 border-2 border-transparent"
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Handicap Play</span>
                {useHandicap && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 font-medium">ON</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {useHandicap
                  ? "Strokes awarded based on handicap index. All players must have a handicap."
                  : "Award strokes to higher-handicap players on the hardest holes."}
              </p>
            </div>
            <div className={`w-12 h-7 rounded-full transition-colors flex items-center ${useHandicap ? "bg-blue-500 justify-end pr-1" : "bg-gray-300 dark:bg-gray-600 justify-start pl-1"}`}>
              <div className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </div>
          </button>

          {/* Missing handicap warning when handicap play is on */}
          {useHandicap && (() => {
            const validPlayers = players.slice(0, playerCount).filter(n => n.trim() !== "");
            const missing = validPlayers.filter(p => handicaps[p] == null || handicaps[p] === 0);
            if (missing.length > 0) {
              return (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                  <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                    ⚠ {missing.length} player{missing.length > 1 ? "s" : ""} need{missing.length === 1 ? "s" : ""} a handicap index: {missing.map(n => n.split(" ")[0]).join(", ")}
                  </p>
                  <p className="text-xs text-red-500 mt-0.5">Game won't start until all handicaps are entered.</p>
                </div>
              );
            }
            return null;
          })()}

          {/* Scorecard Manual Override — pars */}
          <button
            type="button"
            className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4 text-left"
            onClick={() => setShowParSetup(v => !v)}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hole Par Values</span>
                <span className="text-xs text-gray-400">(tap to edit if wrong)</span>
              </div>
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

          {/* Stroke Index / Handicap Rankings — always editable */}
          <>
            {/* Warning when using default (uncustomised) HCP ranks — only matters for handicap play */}
            {useHandicap && hcpRanksSource === "default" && (
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
                  <p className="text-xs text-gray-500 mt-0.5">HCP 1 = hardest hole · determines which holes strokes are given on{!useHandicap && " (optional unless handicap play)"}</p>
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

          <Button
            className="w-full bg-secondary-500 hover:bg-secondary-600 text-white py-3 rounded-lg font-semibold text-[0.9375rem] shadow-sm"
            onClick={() => setStep("minigames")}
            disabled={loadingCourse}
            data-testid="button-continue-minigames"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Mini-Games & Extras
          </Button>
        </div>
    </div>
  );
  } // end players step

  // ── STEP 4: Mini-Games Checklist ──────────────────────────────────────────────
  if (step === "minigames") {
    const eligibleMiniGames = getMiniGamesForSetup(playerCount, selectedGame?.id || "wolf");

    return (
      <div className="pt-6 pb-2 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => setStep("players")}
            className="w-9 h-9 rounded-xl bg-card shadow-card flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight leading-none">Mini-Games</h2>
            <p className="text-[0.8125rem] text-muted-foreground mt-1">Optional side bets to track alongside {selectedGame?.name}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl shadow-card p-5 space-y-3">
          {eligibleMiniGames.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">No mini-games available for this setup</p>
          ) : (
            eligibleMiniGames.map(mg => {
              const active = selectedMiniGames[mg.id]?.enabled || false;
              const value = selectedMiniGames[mg.id]?.value ?? mg.defaultValue;

              return (
                <div key={mg.id}
                  className={`rounded-xl border-2 transition-all ${
                    active
                      ? "border-primary-500 bg-primary-50/50 dark:bg-primary-950/20"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30"
                  }`}
                >
                  {/* Toggle row */}
                  <button
                    className="w-full flex items-center justify-between p-4 text-left"
                    onClick={() => {
                      setSelectedMiniGames(prev => {
                        const updated = { ...prev };
                        if (updated[mg.id]?.enabled) {
                          delete updated[mg.id];
                        } else {
                          updated[mg.id] = { enabled: true, value: mg.defaultValue };
                        }
                        return updated;
                      });
                    }}
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="font-semibold text-gray-900 dark:text-gray-50 text-[0.9375rem]">{mg.name}</p>
                      <p className="text-[0.75rem] text-muted-foreground leading-snug mt-0.5">{mg.description}</p>
                    </div>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      active
                        ? "bg-primary-500 border-primary-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}>
                      {active && <CheckCircle className="w-4 h-4 text-white" />}
                    </div>
                  </button>

                  {/* Value adjuster (only shown when enabled and has a $ value) */}
                  {active && mg.defaultValue > 0 && (
                    <div className="px-4 pb-4 pt-0 flex items-center justify-between">
                      <span className="text-[0.8125rem] text-muted-foreground">Amount ({mg.valueLabel})</span>
                      <div className="flex items-center gap-2">
                        <button
                          className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 active:scale-95 shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMiniGames(prev => ({
                              ...prev,
                              [mg.id]: { ...prev[mg.id], value: Math.max(0, (prev[mg.id]?.value ?? mg.defaultValue) - 1) }
                            }));
                          }}
                        >
                          <span className="text-lg leading-none">−</span>
                        </button>
                        <span className="w-12 text-center text-[1.125rem] font-bold text-gray-900 dark:text-gray-100">${value}</span>
                        <button
                          className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center text-white hover:bg-primary-800 active:scale-95 shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMiniGames(prev => ({
                              ...prev,
                              [mg.id]: { ...prev[mg.id], value: (prev[mg.id]?.value ?? mg.defaultValue) + 1 }
                            }));
                          }}
                        >
                          <span className="text-lg leading-none">+</span>
                        </button>
                      </div>
                    </div>
                  )}
                  {active && mg.defaultValue === 0 && (
                    <div className="px-4 pb-4 pt-0">
                      <span className="text-[0.75rem] text-primary-600 dark:text-primary-400 font-medium">Tracking only — bragging rights!</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <Button
            className="w-full bg-secondary-500 hover:bg-secondary-600 text-white py-3 rounded-lg font-semibold text-[0.9375rem] shadow-sm"
            onClick={handleStartGame}
            disabled={createGameMutation.isPending || loadingCourse || (useHandicap && players.slice(0, playerCount).filter(n => n.trim() !== "").some(p => handicaps[p] == null || handicaps[p] === 0))}
            data-testid="button-start-game"
          >
            {createGameMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Game...</>
            ) : useHandicap && players.slice(0, playerCount).filter(n => n.trim() !== "").some(p => handicaps[p] == null || handicaps[p] === 0) ? (
              <>Enter all handicaps to start</>
            ) : (
              `Start ${selectedGame?.name || "Game"}`
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground py-2 text-[0.8125rem]"
            onClick={() => {
              setSelectedMiniGames({});
              handleStartGame();
            }}
            disabled={createGameMutation.isPending}
          >
            Skip — no mini-games
          </Button>
          {user && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground py-2 text-[0.8125rem]"
              disabled={saveTemplateMutation.isPending}
              onClick={() => {
                const name = window.prompt("Template name (e.g. 'Tuesday Wolf', 'Weekend Skins'):");
                if (!name?.trim()) return;
                saveTemplateMutation.mutate({
                  name: name.trim(),
                  gameType: selectedGame?.id || "wolf",
                  playerCount,
                  defaultHandicaps: handicaps,
                  defaultMiniGames: selectedMiniGames,
                  defaultGameSettings: gameSettings,
                  description: `${selectedGame?.name || selectedGame?.id || "Custom"} · ${playerCount} players`,
                });
              }}
            >
              <Bookmark className="w-3.5 h-3.5 mr-1.5" /> Save as Template
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null; // unreachable but satisfies TS
}
