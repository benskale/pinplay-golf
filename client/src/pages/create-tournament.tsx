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
  CheckCircle, X, Share2, Copy
} from "lucide-react";

interface CourseResult {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  holes: number;
}

export default function CreateTournamentPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [format, setFormat] = useState("stroke_play");
  const [teamSize, setTeamSize] = useState("2");
  const [maxPlayers, setMaxPlayers] = useState("");

  const isTeamFormat = format === "best_ball" || format === "scramble" || format === "ryder_cup";
  const isRyderCup = format === "ryder_cup";

  // Course search
  const [courseQuery, setCourseQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Success state — show invite link
  const [createdTournament, setCreatedTournament] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (user === null) {
      setLocation(`/auth?redirect=/tournament/create`);
    }
  }, [user, setLocation]);

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

  // Course search query
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
    toast({ title: "Course selected", description: `${course.name} · Par ${course.par}` });
  };

  // Create tournament mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/tournaments", data);
      return res.json();
    },
    onSuccess: (tournament) => {
      setCreatedTournament(tournament);
      toast({ title: "Tournament created!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create tournament", description: err.message, variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!date) {
      toast({ title: "Date required", variant: "destructive" });
      return;
    }

    const settings: Record<string, any> = {};
    if (isTeamFormat) {
      settings.teamSize = parseInt(teamSize);
    }

    createMutation.mutate({
      name: name.trim(),
      date,
      courseName: selectedCourse?.name || courseQuery.trim(),
      courseId: selectedCourse?.id || null,
      format,
      maxPlayers: maxPlayers ? parseInt(maxPlayers) : null,
      settings,
    });
  };

  const handleCopyLink = async () => {
    if (!createdTournament) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${createdTournament.inviteCode}`;
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
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/join/${createdTournament.inviteCode}`;
    const text = `Join my golf tournament "${createdTournament.name}" on PinPlay! 🏌️ ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: createdTournament.name, text, url: link });
      } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Invite link copied!" });
    }
  };

  // ── Success state: show invite link ──
  if (createdTournament) {
    return (
      <div className="min-h-screen bg-background font-sans">
        <div className="max-w-md mx-auto px-4 pt-12">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50 tracking-tight">
              Tournament Created!
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
              <Trophy className="mr-2 h-4 w-4" />
              Go to Tournament Lobby
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

  // ── Form state ──
  return (
    <div className="min-h-screen bg-background font-sans">
      <div className="max-w-md mx-auto px-4 pt-4 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/")}
            className="w-9 h-9 rounded-xl bg-card shadow-card flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-[1.375rem] font-bold text-gray-900 dark:text-gray-50 tracking-tight leading-none">
              Host a Tournament
            </h1>
            <p className="text-[0.8125rem] text-muted-foreground mt-1">
              Set up your group round with a shared leaderboard
            </p>
          </div>
        </div>

        <Card className="shadow-card">
          <CardContent className="p-5 space-y-5">
            {/* Tournament Name */}
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tournament Name</Label>
              <Input
                placeholder="e.g., Tuesday Night Skins at Corica"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5"
                maxLength={200}
              />
            </div>

            {/* Date */}
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</Label>
              <div className="relative mt-1.5">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Course Search */}
            <div ref={dropdownRef}>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Golf Course <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search for a course..."
                  value={courseQuery}
                  onChange={(e) => {
                    setCourseQuery(e.target.value);
                    if (selectedCourse) setSelectedCourse(null);
                    setShowDropdown(true);
                  }}
                  onFocus={() => { if (!selectedCourse && courseQuery.length >= 2) setShowDropdown(true); }}
                  className={`pl-9 pr-8 ${selectedCourse ? "border-green-500" : ""}`}
                />
                {selectedCourse && (
                  <button
                    onClick={() => { setSelectedCourse(null); setCourseQuery(""); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {showDropdown && !selectedCourse && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden" style={{ maxWidth: 'calc(100% - 2.5rem)' }}>
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
              {selectedCourse && (
                <div className="mt-2 flex items-center space-x-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>{selectedCourse.city}, {selectedCourse.state} · Par {selectedCourse.par}</span>
                </div>
              )}
            </div>

            {/* Format */}
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stroke_play">Stroke Play</SelectItem>
                  <SelectItem value="stableford">Stableford</SelectItem>
                  <SelectItem value="match_play">Match Play</SelectItem>
                  <SelectItem value="skins">Skins</SelectItem>
                  <SelectItem value="best_ball">Best Ball (Teams)</SelectItem>
                  <SelectItem value="scramble">Scramble (Teams)</SelectItem>
                  <SelectItem value="ryder_cup">Ryder Cup (Team Matches)</SelectItem>
                  <SelectItem value="ringer">Ringer (Multi-Round)</SelectItem>
                  <SelectItem value="net_ringer">Net Ringer (Multi-Round)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {format === "stroke_play" && "Lowest net strokes wins"}
                {format === "stableford" && "Points per hole vs par. Highest points wins. Quota = 36 - handicap"}
                {format === "match_play" && "Hole-by-hole 1v1 matches. Win a hole = go 1 up. Most holes won wins"}
                {format === "skins" && "Lowest net score per hole wins a skin. Ties carry over."}
                {format === "best_ball" && "Teams: best score per hole counts toward team total"}
                {format === "scramble" && "Teams: everyone plays one ball, team posts one score per hole"}
                {format === "ryder_cup" && "Two teams compete across four-ball, foursomes, and singles matches. Points-based team scoring."}
                {format === "ringer" && "Best gross score on each hole across all rounds in the tournament"}
                {format === "net_ringer" && "Best net score on each hole across all rounds (handicap-adjusted)"}
              </p>
            </div>

            {/* Team Size (only for team formats) */}
            {isTeamFormat && (
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Team Size <span className="text-gray-400 font-normal">(players per team)</span>
                </Label>
                <Select value={teamSize} onValueChange={setTeamSize}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 players</SelectItem>
                    <SelectItem value="3">3 players</SelectItem>
                    <SelectItem value="4">4 players</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400 mt-1">Each team starts their own game together</p>
              </div>
            )}

            {/* Max Players */}
            <div>
              <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Max Players <span className="text-gray-400 font-normal">(optional, leave blank for unlimited)</span>
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

            {/* Submit */}
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !name.trim() || !date}
              className="w-full py-3 rounded-xl font-semibold text-sm"
              style={{ background: "#C9A84C", color: "#000" }}
            >
              {createMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
              ) : (
                <>
                  <Trophy className="mr-2 h-4 w-4" />
                  Create & Share
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
