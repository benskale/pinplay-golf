import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Trophy, Loader2, Calendar, MapPin, Search,
  CheckCircle, X, Share2, Copy, Users, ChevronRight,
  ChevronLeft, Plus, DollarSign, Trash2, Sparkles,
} from "lucide-react";
import CustomGameModal from "@/components/custom-game-modal";

interface CourseResult {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  holes: number;
}

interface RoundConfig {
  date: string;
  courseId: string | null;
  courseName: string;
  format: string;
  teamSize: number;
  customGameConfig?: any;
}

interface SideGameConfig {
  enabled: boolean;
  value: number;
}

const FORMAT_LABELS: Record<string, string> = {
  stroke_play: "Stroke Play",
  stableford: "Stableford",
  match_play: "Match Play",
  skins: "Skins",
  best_ball: "Best Ball (Teams)",
  scramble: "Scramble (Teams)",
  ryder_cup: "Ryder Cup (Team Matches)",
  ringer: "Ringer (Multi-Round)",
  net_ringer: "Net Ringer (Multi-Round)",
  custom: "Custom Game",
};

const FORMAT_DESCRIPTIONS: Record<string, string> = {
  stroke_play: "Lowest net strokes wins",
  stableford: "Points per hole vs par. Highest points wins",
  match_play: "Hole-by-hole matches. Most holes won wins",
  skins: "Lowest net score per hole wins a skin. Ties carry over",
  best_ball: "Teams: best score per hole counts toward team total",
  scramble: "Teams: everyone plays one ball, team posts one score",
  ryder_cup: "Two teams compete across four-ball, foursomes, and singles",
  ringer: "Best gross score on each hole across all rounds",
  net_ringer: "Best net score on each hole across all rounds (handicap-adjusted)",
};

const TEAM_FORMATS = ["best_ball", "scramble", "ryder_cup"];

const SIDE_GAME_OPTIONS = [
  { key: "birdie_pool", label: "Birdie Pool", desc: "$ per birdie", default: 5 },
  { key: "skins", label: "Skins", desc: "$ per skin", default: 5 },
  { key: "closest_to_pin", label: "Closest to Pin", desc: "$ per closest", default: 10 },
  { key: "longest_drive", label: "Longest Drive", desc: "$ per longest", default: 10 },
  { key: "sandies", label: "Sandies", desc: "$ per sand save", default: 5 },
  { key: "presses", label: "Presses", desc: "$ per press", default: 5 },
];

const STEPS = ["Event", "Course & Format", "Players", "Side Games", "Review"];

export default function CreateTournamentPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);

  // Step 1: Event details
  const [name, setName] = useState("");
  const [numDays, setNumDays] = useState(1);

  // Step 2: Course & format per day
  const [rounds, setRounds] = useState<RoundConfig[]>([
    { date: new Date().toISOString().split("T")[0], courseId: null, courseName: "", format: "stroke_play", teamSize: 2 },
  ]);

  // Step 3: Players
  const [players, setPlayers] = useState<string[]>([]);
  const [playerInput, setPlayerInput] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("");

  // Step 4: Side games
  const [sideGames, setSideGames] = useState<Record<string, SideGameConfig>>({});

  // Success state
  const [createdTournament, setCreatedTournament] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (user === null) {
      setLocation(`/auth?redirect=/tournament/create`);
    }
  }, [user, setLocation]);

  // When numDays changes, grow/shrink rounds array
  const handleNumDaysChange = (days: number) => {
    setNumDays(days);
    setRounds(prev => {
      const next = [...prev];
      while (next.length < days) {
        const lastDate = next[next.length - 1]?.date || new Date().toISOString().split("T")[0];
        const d = new Date(lastDate);
        d.setDate(d.getDate() + 1);
        next.push({
          date: d.toISOString().split("T")[0],
          courseId: null,
          courseName: "",
          format: "stroke_play",
          teamSize: 2,
        });
      }
      while (next.length > days) next.pop();
      return next;
    });
  };

  const updateRound = (index: number, patch: Partial<RoundConfig>) => {
    setRounds(prev => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const hasTeamFormat = rounds.some(r => TEAM_FORMATS.includes(r.format));

  const addPlayer = () => {
    const trimmed = playerInput.trim();
    if (!trimmed) return;
    if (players.includes(trimmed)) {
      toast({ title: "Already added", variant: "destructive" });
      return;
    }
    if (trimmed.length > 50) {
      toast({ title: "Name too long (50 chars max)", variant: "destructive" });
      return;
    }
    setPlayers(prev => [...prev, trimmed]);
    setPlayerInput("");
  };

  const removePlayer = (p: string) => {
    setPlayers(prev => prev.filter(x => x !== p));
  };

  const toggleSideGame = (key: string, defaultVal: number) => {
    setSideGames(prev => ({
      ...prev,
      [key]: prev[key]?.enabled
        ? { ...prev[key], enabled: false }
        : { enabled: true, value: prev[key]?.value ?? defaultVal },
    }));
  };

  const updateSideGameValue = (key: string, value: number) => {
    setSideGames(prev => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
  };

  // Create tournament mutation (handles multi-step creation internally)
  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create the tournament
      const primaryRound = rounds[0];
      const settings: Record<string, any> = {};
      if (hasTeamFormat) {
        settings.teamSize = primaryRound.teamSize;
      }
      // Pack side games into settings
      const activeSideGames: Record<string, { enabled: boolean; value: number }> = {};
      for (const [key, cfg] of Object.entries(sideGames)) {
        if (cfg.enabled) activeSideGames[key] = cfg;
      }
      if (Object.keys(activeSideGames).length > 0) {
        settings.sideGames = activeSideGames;
      }
      // Pack custom game configs per round
      const roundConfigs: Record<number, any> = {};
      for (let i = 0; i < rounds.length; i++) {
        if (rounds[i].customGameConfig) {
          roundConfigs[i] = rounds[i].customGameConfig;
        }
      }
      if (Object.keys(roundConfigs).length > 0) {
        settings.customGameConfigs = roundConfigs;
      }

      const res = await apiRequest("POST", "/api/tournaments", {
        name: name.trim(),
        date: primaryRound.date,
        courseName: primaryRound.courseName || "",
        courseId: primaryRound.courseId,
        format: primaryRound.format,
        maxPlayers: maxPlayers ? parseInt(maxPlayers) : null,
        settings,
      });
      const tournament = await res.json();

      // 2. Create additional rounds for multi-day
      for (let i = 1; i < rounds.length; i++) {
        const r = rounds[i];
        await apiRequest("POST", `/api/tournaments/${tournament.id}/rounds`, {
          name: `Day ${i + 1}`,
          format: r.format,
          date: r.date,
        });
      }

      // 3. Add manually-added players
      for (const playerName of players) {
        await apiRequest("POST", `/api/tournaments/${tournament.id}/players`, {
          name: playerName,
        });
      }

      return tournament;
    },
    onSuccess: (tournament) => {
      setCreatedTournament(tournament);
      toast({ title: "Group Play created!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create", description: err.message, variant: "destructive" });
    },
  });

  const handleCopyLink = async () => {
    if (!createdTournament) return;
    const link = `${window.location.origin}/join/${createdTournament.inviteCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({ title: "Invite link copied!" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!createdTournament) return;
    const link = `${window.location.origin}/join/${createdTournament.inviteCode}`;
    const text = `Join my golf group "${createdTournament.name}" on PinPlay! ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: createdTournament.name, text, url: link });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Invite link copied!" });
    }
  };

  // ── Success state ──
  if (createdTournament) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <div className="max-w-md mx-auto px-4 pt-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
              Group Play Created!
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Share the invite link below with your players
            </p>
          </div>

          <Card className="shadow-card mb-4">
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{createdTournament.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(createdTournament.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  {createdTournament.courseName ? ` · ${createdTournament.courseName}` : ""}
                  {numDays > 1 ? ` · ${numDays} days` : ""}
                </p>
              </div>

              <div>
                <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Invite Link</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    readOnly
                    value={`${window.location.origin}/join/${createdTournament.inviteCode}`}
                    className="text-xs"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex-shrink-0 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {copiedLink ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-500" />}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Button
              onClick={handleShare}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: "#C9A84C", color: "#000" }}
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Invite Link
            </Button>
            <Button
              onClick={() => setLocation(`/tournament/${createdTournament.id}`)}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-green-600 hover:bg-green-700 text-white"
            >
              <Users className="mr-2 h-4 w-4" />
              Go to Group Play Lobby
            </Button>
            <Button
              onClick={() => setLocation("/")}
              variant="outline"
              className="w-full py-2 rounded-xl text-sm"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Validation per step ──
  const canProceed = () => {
    if (step === 0) return name.trim().length > 0;
    return true;
  };

  // ── Wizard ──
  return (
    <div className="min-h-screen bg-background font-sans">
      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => step === 0 ? setLocation("/") : setStep(step - 1)}
            className="w-9 h-9 rounded-xl bg-card shadow-card flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            {step === 0 ? <ArrowLeft className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
          <div>
            <h1 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight leading-none">
              Start Group Play
            </h1>
            <p className="text-[0.8125rem] text-muted-foreground mt-1">
              {STEPS[step]} — Step {step + 1} of {STEPS.length}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i <= step ? "bg-amber-500" : "bg-gray-200 dark:bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        {step === 0 && (
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-5">
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Event Name</Label>
                <Input
                  placeholder="e.g., Weekend Wolf at Corica"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                  maxLength={200}
                  autoFocus
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">How many days?</Label>
                <div className="grid grid-cols-4 gap-2 mt-1.5">
                  {[1, 2, 3, 4].map(d => (
                    <button
                      key={d}
                      onClick={() => handleNumDaysChange(d)}
                      className={`py-3 rounded-xl font-bold text-lg transition-all ${
                        numDays === d
                          ? "bg-amber-500 text-black shadow-md"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {numDays === 1 ? "Single-day event" : `${numDays}-day event with separate rounds each day`}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {rounds.map((round, idx) => (
              <CourseFormatCard
                key={idx}
                index={idx}
                round={round}
                onUpdate={(patch) => updateRound(idx, patch)}
                isLast={idx === rounds.length - 1}
                playerCount={players.length || 4}
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-5">
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Add Players</Label>
                <div className="flex gap-2 mt-1.5">
                  <Input
                    placeholder="Player name..."
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPlayer(); } }}
                    className="flex-1"
                    maxLength={50}
                  />
                  <Button
                    onClick={addPlayer}
                    disabled={!playerInput.trim()}
                    className="px-3 rounded-xl"
                    style={{ background: "#C9A84C", color: "#000" }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Add players now, or share an invite link after creation for others to join
                </p>
              </div>

              {players.length > 0 && (
                <div className="space-y-2">
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{p}</span>
                      <button onClick={() => removePlayer(p)} className="text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Max Players <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  type="number"
                  min="2"
                  max="200"
                  placeholder="Unlimited"
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              {hasTeamFormat && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Team format detected. You can assign players to teams from the lobby after creation.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Side Games & Bets</p>
                <p className="text-xs text-gray-400">Optional. Set dollar values for extra action during the round.</p>
              </div>

              {SIDE_GAME_OPTIONS.map(opt => {
                const cfg = sideGames[opt.key];
                const enabled = cfg?.enabled ?? false;
                return (
                  <div
                    key={opt.key}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      enabled
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"
                        : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <button
                        onClick={() => toggleSideGame(opt.key, opt.default)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                          enabled
                            ? "bg-amber-500 border-amber-500"
                            : "border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {enabled && <CheckCircle className="w-4 h-4 text-black" />}
                      </button>
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{opt.label}</p>
                        <p className="text-xs text-gray-400">{opt.desc}</p>
                      </div>
                    </div>
                    {enabled && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={cfg?.value ?? 0}
                          onChange={(e) => updateSideGameValue(opt.key, parseFloat(e.target.value) || 0)}
                          className="w-16 h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card className="shadow-card">
            <CardContent className="p-5 space-y-4">
              <div className="space-y-3">
                {/* Name */}
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Event</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-right">{name}</span>
                </div>

                {/* Days */}
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Duration</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 text-right">
                    {numDays === 1 ? "1 day" : `${numDays} days`}
                  </span>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 my-3" />

                {/* Rounds */}
                {rounds.map((r, i) => (
                  <div key={i} className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {numDays > 1 ? `Day ${i + 1}` : "Round"}
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
                        {r.customGameConfig ? (r.customGameConfig.name || "Custom Game") : (FORMAT_LABELS[r.format] || r.format)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {r.courseName || "Course TBD"}
                        {r.customGameConfig && r.customGameConfig.description ? ` · ${r.customGameConfig.description.slice(0, 40)}` : ""}
                        {!r.customGameConfig && TEAM_FORMATS.includes(r.format) ? ` · ${r.teamSize}v${r.teamSize}` : ""}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="border-t border-gray-100 dark:border-gray-800 my-3" />

                {/* Players */}
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Players</span>
                  <div className="text-right">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
                      {players.length > 0 ? `${players.length} added` : "Invite after creation"}
                    </span>
                    {maxPlayers && <span className="text-xs text-gray-400">Max: {maxPlayers}</span>}
                  </div>
                </div>

                {/* Side games */}
                {Object.values(sideGames).some(s => s.enabled) && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-800 my-3" />
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Side Games</span>
                      <div className="text-right">
                        {Object.entries(sideGames).filter(([_, v]) => v.enabled).map(([k, v]) => {
                          const opt = SIDE_GAME_OPTIONS.find(o => o.key === k);
                          return (
                            <span key={k} className="text-xs text-gray-500 block">
                              {opt?.label || k}: ${v.value}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !name.trim()}
                className="w-full py-3 rounded-xl font-semibold text-sm"
                style={{ background: "#C9A84C", color: "#000" }}
              >
                {createMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                ) : (
                  <><Trophy className="mr-2 h-4 w-4" />Create Group Play</>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Navigation buttons */}
        {step < 4 && (
          <div className="mt-4">
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: "#C9A84C", color: "#000" }}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Course & Format card (used in step 2) ───────────────────────────────────

function CourseFormatCard({
  index,
  round,
  onUpdate,
  isLast,
  playerCount,
}: {
  index: number;
  round: RoundConfig;
  onUpdate: (patch: Partial<RoundConfig>) => void;
  isLast: boolean;
  playerCount: number;
}) {
  const { toast } = useToast();
  const [courseQuery, setCourseQuery] = useState(round.courseName || "");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCustomGameModal, setShowCustomGameModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(
    round.courseId ? { id: round.courseId, name: round.courseName, city: "", state: "", par: 0, holes: 18 } as CourseResult : null
  );
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedCourse) return;
    const timer = setTimeout(() => setDebouncedQuery(courseQuery), 400);
    return () => clearTimeout(timer);
  }, [courseQuery, selectedCourse]);

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

  const courses = searchData?.courses || [];

  const handleSelectCourse = (course: CourseResult) => {
    setSelectedCourse(course);
    setCourseQuery(course.name);
    setShowDropdown(false);
    onUpdate({ courseId: course.id, courseName: course.name });
    toast({ title: "Course selected", description: `${course.name} · Par ${course.par}` });
  };

  const clearCourse = () => {
    setSelectedCourse(null);
    setCourseQuery("");
    onUpdate({ courseId: null, courseName: "" });
  };

  const handleCustomGameConfirm = (config: any) => {
    if (!config) return;
    onUpdate({
      format: "custom",
      customGameConfig: config,
      teamSize: config.teams?.[0]?.size || round.teamSize,
    });
    setShowCustomGameModal(false);
    toast({ title: "Custom game set", description: config.name || "Custom format configured" });
  };

  const handlePresetSelect = (presetId: string) => {
    onUpdate({ format: presetId, customGameConfig: undefined });
    setShowCustomGameModal(false);
    toast({ title: "Format selected", description: FORMAT_LABELS[presetId] || presetId });
  };

  const isTeamFormat = TEAM_FORMATS.includes(round.format);

  return (
    <Card className="shadow-card">
      <CardContent className="p-5 space-y-4">
        {/* Day label */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
            {index === 0 ? "Round" : `Day ${index + 1}`}
          </span>
        </div>

        {/* Date */}
        <div>
          <Label className="text-xs font-medium text-gray-500">Date</Label>
          <Input
            type="date"
            value={round.date}
            onChange={(e) => onUpdate({ date: e.target.value })}
            className="mt-1 h-9 text-sm"
          />
        </div>

        {/* Course search */}
        <div ref={dropdownRef}>
          <Label className="text-xs font-medium text-gray-500">
            Golf Course <span className="text-gray-400 font-normal">(optional)</span>
          </Label>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Search for a course..."
              value={courseQuery}
              onChange={(e) => {
                setCourseQuery(e.target.value);
                if (selectedCourse) {
                  setSelectedCourse(null);
                  onUpdate({ courseId: null, courseName: "" });
                }
                setShowDropdown(true);
              }}
              onFocus={() => { if (!selectedCourse && courseQuery.length >= 2) setShowDropdown(true); }}
              className={`pl-9 pr-8 h-9 text-sm ${selectedCourse ? "border-green-500" : ""}`}
            />
            {selectedCourse && (
              <button
                onClick={clearCourse}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {showDropdown && !selectedCourse && (
            <div className="absolute z-20 mt-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden" style={{ maxWidth: 'calc(100vw - 3rem)' }}>
              {isSearching ? (
                <div className="flex items-center space-x-2 px-4 py-3 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Searching...</span>
                </div>
              ) : courses.length > 0 ? courses.slice(0, 6).map((course) => (
                <button key={course.id} type="button" onClick={() => handleSelectCourse(course)}
                  className="w-full flex items-start space-x-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-left border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
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
        </div>

        {/* Format */}
        <div>
          <Label className="text-xs font-medium text-gray-500">Format</Label>
          {round.customGameConfig ? (
            <div className="mt-1 p-3 rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-900/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {round.customGameConfig.name || "Custom Game"}
                    </p>
                    {round.customGameConfig.description && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {round.customGameConfig.description.slice(0, 60)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setShowCustomGameModal(true)}
                    className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline px-2"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onUpdate({ format: "stroke_play", customGameConfig: undefined })}
                    className="text-xs font-medium text-gray-400 hover:text-red-500 px-2"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <Select value={round.format} onValueChange={(v) => {
                if (v === "custom") {
                  setShowCustomGameModal(true);
                } else {
                  onUpdate({ format: v, customGameConfig: undefined });
                }
              }}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMAT_LABELS).filter(([val]) => val !== "custom").map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                  <SelectItem value="custom">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                      Custom Game
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">{round.format === "custom" ? "Describe any format in your own words" : (FORMAT_DESCRIPTIONS[round.format] || "")}</p>
            </>
          )}
        </div>

        {/* Note: Custom Game is selectable from the format dropdown above, not a separate button */}

        {/* Team size */}
        {isTeamFormat && (
          <div>
            <Label className="text-xs font-medium text-gray-500">Team Size</Label>
            <Select
              value={String(round.teamSize)}
              onValueChange={(v) => onUpdate({ teamSize: parseInt(v) })}
            >
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 players</SelectItem>
                <SelectItem value="3">3 players</SelectItem>
                <SelectItem value="4">4 players</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>

      {/* Custom Game Chat Modal */}
      {showCustomGameModal && (
        <CustomGameModal
          playerCount={playerCount}
          onClose={() => setShowCustomGameModal(false)}
          onConfirm={handleCustomGameConfirm}
          onPresetSelect={handlePresetSelect}
        />
      )}
    </Card>
  );
}
