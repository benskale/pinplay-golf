import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, LogOut, Trophy, Calendar, User, Loader2, Save,
  Camera, Star, Search, X, Share2, Copy, MessageCircle, MessageSquare,
  ChevronRight, Trash2, MapPin, Link2
} from "lucide-react";
import { GAME_DEFINITIONS } from "@/lib/game-logic";
import { completeGame } from "@/lib/game-recovery";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Game } from "@shared/schema";

// Detect Capacitor native environment (iOS/Android)
const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

// ── Types ────────────────────────────────────────────────────────────────────

interface FavoriteUser {
  id: number;
  userId: number;
  favoriteUserId: number;
  favoriteName: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface SearchUserResult {
  id: number;
  name: string;
  avatarUrl: string | null;
}

interface CourseResult {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  holes: number;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { user, isLoading, updateProfileMutation, uploadAvatarMutation, logoutMutation, deleteAccountMutation } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState(user?.name ?? "");
  const [handicap, setHandicap] = useState(user?.handicapIndex?.toString() ?? "");
  const [homeCourse, setHomeCourse] = useState(user?.homeCourse ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [editing, setEditing] = useState(false);
  const [showInviteShare, setShowInviteShare] = useState(false);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  // Course search state (for home course)
  const [courseQuery, setCourseQuery] = useState(user?.homeCourse ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const courseDropdownRef = useRef<HTMLDivElement>(null);

  // Favorites state
  const [favSearchQuery, setFavSearchQuery] = useState("");
  const [showFavSearch, setShowFavSearch] = useState(false);

  // Avatar upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: gameHistory = [], isLoading: historyLoading } = useQuery<Game[]>({
    queryKey: ["/api/auth/games"],
    queryFn: async () => {
      const res = await fetch("/api/auth/games", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: favorites = [] } = useQuery<FavoriteUser[]>({
    queryKey: ["/api/auth/favorites"],
    queryFn: async () => {
      const res = await fetch("/api/auth/favorites", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const { data: inviteLink } = useQuery<{ link: string; text: string }>({
    queryKey: ["/api/auth/invite-link"],
    queryFn: async () => {
      const res = await fetch("/api/auth/invite-link", { credentials: "include" });
      if (!res.ok) return { link: "", text: "" };
      return res.json();
    },
    enabled: !!user,
  });

  // Course search query
  const { data: courseData, isFetching: isSearchingCourses } = useQuery<{ courses: CourseResult[] }>({
    queryKey: ["/api/courses/search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    queryFn: async () => {
      const res = await fetch(`/api/courses/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) return { courses: [] };
      return res.json();
    },
  });

  // User search for favorites
  const { data: searchResults = [], isFetching: isSearchingUsers } = useQuery<SearchUserResult[]>({
    queryKey: ["/api/auth/search-users", favSearchQuery],
    enabled: favSearchQuery.length >= 2 && showFavSearch,
    queryFn: async () => {
      const res = await fetch(`/api/auth/search-users?q=${encodeURIComponent(favSearchQuery)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const addFavoriteMutation = useMutation({
    mutationFn: async ({ favoriteUserId, favoriteName }: { favoriteUserId: number; favoriteName: string }) => {
      const res = await apiRequest("POST", "/api/auth/favorites", { favoriteUserId, favoriteName });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/favorites"] });
      setFavSearchQuery("");
      setShowFavSearch(false);
      toast({ title: "Added to favorites" });
    },
    onError: (err: Error) => toast({ title: "Couldn't add favorite", description: err.message, variant: "destructive" }),
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: async (favoriteUserId: number) => {
      const res = await apiRequest("DELETE", `/api/auth/favorites/${favoriteUserId}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/favorites"] });
      toast({ title: "Removed from favorites" });
    },
    onError: (err: Error) => toast({ title: "Couldn't remove", description: err.message, variant: "destructive" }),
  });

  // Delete game mutation
  const deleteGameMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const res = await apiRequest("DELETE", `/api/games/${gameId}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
    },
    onSuccess: (_data, gameId) => {
      completeGame(gameId); // remove from localStorage guest-tracking
      queryClient.invalidateQueries({ queryKey: ["/api/auth/games"] });
      queryClient.invalidateQueries({ queryKey: ["guest-games"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      toast({ title: "Round deleted" });
    },
    onError: (err: Error) => toast({ title: "Couldn't delete round", description: err.message, variant: "destructive" }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Debounce course search
  const handleCourseInput = (val: string) => {
    setCourseQuery(val);
    setShowCourseDropdown(true);
    const timer = setTimeout(() => setDebouncedQuery(val), 400);
    return () => clearTimeout(timer);
  };

  const handleSelectCourse = (course: CourseResult) => {
    setCourseQuery(course.name);
    setShowCourseDropdown(false);
    setHomeCourse(course.name);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      name,
      phone: phone || null,
      handicapIndex: handicap === "" ? null : parseFloat(handicap),
      homeCourse: homeCourse || null,
    }, { onSuccess: () => setEditing(false) });
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/") });
  };

  const resizeAvatarDataUrl = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const SIZE = 256;
          const canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(dataUrl); return; }
          const scale = Math.max(SIZE / img.width, SIZE / img.height);
          const sw = SIZE / scale;
          const sh = SIZE / scale;
          const sx = (img.width - sw) / 2;
          const sy = (img.height - sh) / 2;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch { resolve(dataUrl); }
      };
      img.onerror = () => reject(new Error("Couldn't process image"));
      img.src = dataUrl;
    });
  };

  const handleAvatarClick = async () => {
    if (isNative()) {
      // Try Capacitor Camera plugin for native image picker
      try {
        const cameraModule = await import("@capacitor/camera");
        const Camera = cameraModule.Camera;
        const CameraResultType = cameraModule.CameraResultType;
        const CameraSource = cameraModule.CameraSource;
        const photo = await Camera.getPhoto({
          quality: 80,
          allowEditing: true,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos,
        });
        // Resize to 256x256 to keep payload small (~15-30KB vs potentially several MB)
        const resized = await resizeAvatarDataUrl(photo.dataUrl!);
        uploadAvatarMutation.mutate(resized);
      } catch (err: any) {
        // User cancelled — silently ignore
        if (err?.message?.includes("cancelled") || err?.message?.includes("User cancelled")) return;
        // Camera plugin not available — fall back to file input (works in WKWebView on iPad)
        console.warn("Camera plugin unavailable, falling back to file input:", err);
        fileInputRef.current?.click();
      }
    } else {
      // Web — use file input
      fileInputRef.current?.click();
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 10MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const resized = await resizeAvatarDataUrl(reader.result as string);
        uploadAvatarMutation.mutate(resized);
      } catch {
        sendAvatarRaw(file);
      }
    };
    reader.onerror = () => {
      toast({ title: "Couldn't read image", description: "Try a different photo", variant: "destructive" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Fallback: send raw file as base64 when canvas is unavailable (iPad WKWebView)
  const sendAvatarRaw = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      uploadAvatarMutation.mutate(dataUrl);
    };
    reader.onerror = () => {
      toast({ title: "Couldn't read image", description: "Try a different photo", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  const getInitials = (n: string) => n.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);

  const isFavorite = (userId: number) => favorites.some(f => f.favoriteUserId === userId);

  const handleShareInvite = (method: "copy" | "whatsapp" | "sms") => {
    if (!inviteLink?.text) return;
    if (method === "copy") {
      navigator.clipboard.writeText(inviteLink.text).then(() => {
        toast({ title: "Invite link copied!" });
      }).catch(() => {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = inviteLink.text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast({ title: "Invite link copied!" });
      });
    } else if (method === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(inviteLink.text)}`, "_blank");
    } else {
      window.open(`sms:?body=${encodeURIComponent(inviteLink.text)}`, "_blank");
    }
  };

  // ── Loading / auth guard ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  // ── Helper: get game winner ───────────────────────────────────────────────

  const getGameWinner = (game: Game): string | null => {
    if (!game.totalScores || !game.players) return null;
    const entries = Object.entries(game.totalScores);
    if (entries.length === 0) return null;
    const sorted = entries.sort(([, a], [, b]) => (b as number) - (a as number));
    // For stroke play, lowest strokes wins — handle that separately
    if (game.gameType === "stroke_play") {
      // totalScores stores strokes (lower is better)
      const byStrokes = entries.sort(([, a], [, b]) => (a as number) - (b as number));
      return byStrokes[0]?.[0] ?? null;
    }
    return sorted[0]?.[0] ?? null;
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const courses = courseData?.courses || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="text-white sticky top-0 z-50 header-surface">
        <div className="max-w-md mx-auto px-4 pt-4 pb-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setLocation("/")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <img src="/logo-dark.png" alt="PinPlay Golf" className="h-7 w-auto" />
            <button onClick={handleLogout} disabled={logoutMutation.isPending} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/15 text-white/70 hover:text-white">
              {logoutMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            </button>
          </div>

          {/* Avatar + name — clickable to upload */}
          <div className="flex flex-col items-center text-center">
            <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
              <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-white/30 shadow-lg">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold" style={{ background: "rgba(255,255,255,0.15)" }}>
                    {getInitials(user.name)}
                  </div>
                )}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
              {uploadAvatarMutation.isPending && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <h1 className="text-lg font-bold mt-2">{user.name}</h1>
            <p className="text-xs mt-0.5" style={{ color: "rgba(134,196,159,0.8)" }}>
              {user.email ?? user.phone ?? ""}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4 pb-16">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Rounds", value: gameHistory.length },
            { label: "Handicap", value: user.handicapIndex != null ? user.handicapIndex.toFixed(1) : "—" },
            { label: "Favorites", value: favorites.length },
          ].map(({ label, value }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-primary-700 dark:text-primary-400">{value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Profile card */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary-600" />
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">Profile</h2>
              </div>
              {!editing && (
                <button onClick={() => {
                  setName(user.name);
                  setHandicap(user.handicapIndex?.toString() ?? "");
                  setCourseQuery(user.homeCourse ?? "");
                  setHomeCourse(user.homeCourse ?? "");
                  setPhone(user.phone ?? "");
                  setEditing(true);
                }}
                  className="text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline">
                  Edit
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={handleSave} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} className="rounded-xl h-11" required />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Phone</Label>
                  <Input type="tel" placeholder="(555) 123-4567" value={phone} onChange={e => setPhone(e.target.value)} className="rounded-xl h-11" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">GHIN Handicap Index</Label>
                  <Input type="number" step="0.1" min="0" max="54" placeholder="e.g. 12.4" value={handicap} onChange={e => setHandicap(e.target.value)} className="rounded-xl h-11" />
                </div>
                <div className="space-y-1 relative" ref={courseDropdownRef}>
                  <Label className="text-xs text-gray-500">Home Course</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      placeholder="Search for your home club..."
                      value={courseQuery}
                      onChange={e => handleCourseInput(e.target.value)}
                      onFocus={() => { if (courseQuery.length >= 2) setShowCourseDropdown(true); }}
                      className="pl-9 rounded-xl h-11"
                    />
                    {isSearchingCourses && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                  </div>
                  {/* Course search dropdown */}
                  {showCourseDropdown && courses.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {courses.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCourse(c)}
                          className="w-full text-left px-3 py-2.5 hover:bg-primary-50 dark:hover:bg-primary-950/30 border-b border-gray-100 dark:border-gray-800 last:border-0"
                        >
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.name}</p>
                          <p className="text-xs text-gray-500">{c.city}, {c.state} · Par {c.par}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="outline" onClick={() => setEditing(false)} className="flex-1 rounded-xl">Cancel</Button>
                  <Button type="submit" disabled={updateProfileMutation.isPending} className="flex-1 rounded-xl bg-primary-700 hover:bg-primary-800 text-white">
                    {updateProfileMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1.5" />Save</>}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{user.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{user.email ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Phone</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{user.phone ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Handicap Index</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {user.handicapIndex != null ? user.handicapIndex.toFixed(1) : "Not set"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Home Course</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 text-right max-w-[180px] truncate">{user.homeCourse || "Not set"}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Favorites card */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-primary-600" />
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">Favorites</h2>
                <span className="text-xs text-gray-400">({favorites.length})</span>
              </div>
              {!showFavSearch && (
                <button
                  onClick={() => setShowFavSearch(true)}
                  className="text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline"
                >
                  + Add
                </button>
              )}
            </div>

            {/* Search to add favorites */}
            {showFavSearch && (
              <div className="mb-4 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by name or email..."
                    value={favSearchQuery}
                    onChange={e => setFavSearchQuery(e.target.value)}
                    className="pl-9 pr-9 rounded-xl h-11"
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowFavSearch(false); setFavSearchQuery(""); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
                {isSearchingUsers && (
                  <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                )}
                {searchResults.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                            {u.avatarUrl ? (
                              <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300">
                                {getInitials(u.name)}
                              </div>
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{u.name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant={isFavorite(u.id) ? "outline" : "default"}
                          className="rounded-lg text-xs h-7"
                          disabled={isFavorite(u.id) || addFavoriteMutation.isPending}
                          onClick={() => addFavoriteMutation.mutate({ favoriteUserId: u.id, favoriteName: u.name })}
                        >
                          {isFavorite(u.id) ? "Added" : "Add"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {favSearchQuery.length >= 2 && !isSearchingUsers && searchResults.length === 0 && (
                  <p className="text-xs text-gray-500 text-center py-2">No users found</p>
                )}
              </div>
            )}

            {/* Favorites list */}
            {favorites.length === 0 && !showFavSearch ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No favorites yet.</p>
                <p className="text-xs text-gray-400 mt-1">Add players you play with often for quick access.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {favorites.map(fav => (
                  <div key={fav.id} className="flex items-center justify-between py-2 px-1 group">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                        {fav.avatarUrl ? (
                          <img src={fav.avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300">
                            {getInitials(fav.favoriteName)}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{fav.favoriteName}</span>
                    </div>
                    <button
                      onClick={() => removeFavoriteMutation.mutate(fav.favoriteUserId)}
                      disabled={removeFavoriteMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invite card */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Share2 className="w-4 h-4 text-primary-600" />
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Invite Friends</h2>
            </div>
            <p className="text-xs text-gray-500 mb-3">Share PinPlay Golf with your golf group.</p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="rounded-xl text-xs h-9"
                onClick={() => handleShareInvite("copy")}
              >
                <Copy className="w-3.5 h-3.5 mr-1" />
                Copy
              </Button>
              <Button
                className="rounded-xl text-xs h-9 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleShareInvite("whatsapp")}
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1" />
                WhatsApp
              </Button>
              <Button
                className="rounded-xl text-xs h-9 bg-blue-500 hover:bg-blue-600 text-white"
                onClick={() => handleShareInvite("sms")}
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1" />
                Text
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Game history */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-primary-600" />
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Round History</h2>
              <span className="text-xs text-gray-400">({gameHistory.length})</span>
            </div>

            {historyLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : gameHistory.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500">No rounds yet.</p>
                <button onClick={() => setLocation("/")} className="text-sm text-primary-600 dark:text-primary-400 font-semibold mt-1 hover:underline">
                  Start your first game
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {gameHistory.map(game => {
                  const gameDef = GAME_DEFINITIONS[game.gameType];
                  const winner = getGameWinner(game);
                  const userScore = game.totalScores?.[user.name];
                  const holesPlayed = game.holeHistory?.length ?? 0;
                  const isExpanded = expandedGame === game.id;

                  return (
                    <div key={game.id}>
                      <button
                        onClick={() => setExpandedGame(isExpanded ? null : game.id)}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{gameDef?.name ?? game.gameType}</p>
                            {winner === user.name && (
                              <span className="text-[0.625rem] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">🏆 WON</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <p className="text-xs text-gray-500">
                              {new Date(game.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {game.courseName ? ` · ${game.courseName}` : ""}
                              {` · ${holesPlayed} holes`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {userScore != null && (
                            <div className="text-right">
                              <p className="text-sm font-bold text-primary-700 dark:text-primary-400">{userScore}</p>
                              <p className="text-xs text-gray-400">pts</p>
                            </div>
                          )}
                          <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-1 ml-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 space-y-1.5">
                          {(game.players || []).map(playerName => {
                            const score = game.totalScores?.[playerName];
                            const isWinner = playerName === winner;
                            return (
                              <div key={playerName} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-medium ${playerName === user.name ? "text-primary-700 dark:text-primary-400" : "text-gray-700 dark:text-gray-300"}`}>
                                    {playerName}
                                    {playerName === user.name && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                                  </span>
                                  {isWinner && <span className="text-amber-500 text-xs">🏆</span>}
                                </div>
                                <span className="text-gray-600 dark:text-gray-400 font-medium">{score ?? "—"}</span>
                              </div>
                            );
                          })}
                          <button
                            onClick={(e) => { e.stopPropagation(); setLocation(`/game/${game.id}`); }}
                            className="w-full text-center text-xs text-primary-600 dark:text-primary-400 font-semibold hover:underline pt-1"
                          >
                            View Full Game →
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Delete this round? This can't be undone.")) {
                                deleteGameMutation.mutate(game.id);
                              }
                            }}
                            disabled={deleteGameMutation.isPending}
                            className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:text-red-600 dark:text-red-400 font-medium hover:underline pt-2"
                          >
                            <Trash2 className="w-3 h-3" />
                            {deleteGameMutation.isPending ? "Deleting..." : "Delete Round"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Account */}
        {user && (
          <div className="mt-6 max-w-sm mx-auto pb-8">
            <button
              onClick={() => {
                if (confirm("This will permanently delete your account and all personal data. This cannot be undone.\n\nAre you sure?")) {
                  deleteAccountMutation.mutate(undefined, {
                    onSuccess: () => setLocation("/"),
                  });
                }
              }}
              disabled={deleteAccountMutation.isPending}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors font-medium text-sm"
            >
              <Trash2 className="w-4 h-4" />
              {deleteAccountMutation.isPending ? "Deleting account..." : "Delete Account"}
            </button>
            <p className="text-center text-xs text-gray-400 mt-2">
              Permanently removes your profile, favorites, and personal data. Game scores are preserved for other players.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
