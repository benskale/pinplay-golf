import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, LogOut, Trophy, Calendar, User, Loader2, Save } from "lucide-react";
import { GAME_DEFINITIONS } from "@/lib/game-logic";
import type { Game } from "@shared/schema";

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const { user, isLoading, updateProfileMutation, logoutMutation } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [handicap, setHandicap] = useState(user?.handicapIndex?.toString() ?? "");
  const [homeCourse, setHomeCourse] = useState(user?.homeCourse ?? "");
  const [editing, setEditing] = useState(false);

  const { data: gameHistory = [], isLoading: historyLoading } = useQuery<Game[]>({
    queryKey: ["/api/auth/games"],
    queryFn: async () => {
      const res = await fetch("/api/auth/games", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      name,
      handicapIndex: handicap === "" ? null : parseFloat(handicap),
      homeCourse: homeCourse || null,
    }, { onSuccess: () => setEditing(false) });
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, { onSuccess: () => setLocation("/") });
  };

  const getInitials = (n: string) => n.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="text-white sticky top-0 z-50" style={{ background: "linear-gradient(160deg, #081f10 0%, #0f3520 60%, #155e35 100%)" }}>
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

          {/* Avatar + name */}
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mb-2" style={{ background: "rgba(255,255,255,0.15)" }}>
              {getInitials(user.name)}
            </div>
            <h1 className="text-lg font-bold">{user.name}</h1>
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
            { label: "Home Course", value: user.homeCourse ? user.homeCourse.split(" ")[0] : "—" },
          ].map(({ label, value }) => (
            <Card key={label} className="shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-primary-700 dark:text-primary-400 truncate">{value}</p>
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
                <button onClick={() => { setName(user.name); setHandicap(user.handicapIndex?.toString() ?? ""); setHomeCourse(user.homeCourse ?? ""); setEditing(true); }}
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
                  <Label className="text-xs text-gray-500">GHIN Handicap Index</Label>
                  <Input type="number" step="0.1" min="0" max="54" placeholder="e.g. 12.4" value={handicap} onChange={e => setHandicap(e.target.value)} className="rounded-xl h-11" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Home Course</Label>
                  <Input placeholder="e.g. Pebble Beach" value={homeCourse} onChange={e => setHomeCourse(e.target.value)} className="rounded-xl h-11" />
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

        {/* Game history */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="w-4 h-4 text-primary-600" />
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Round History</h2>
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
                  const userScore = game.totalScores[user.name];
                  const holesPlayed = game.holeHistory.length;
                  return (
                    <button
                      key={game.id}
                      onClick={() => setLocation(`/game/${game.id}`)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/20 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{gameDef?.name ?? game.gameType}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-500">
                            {new Date(game.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {game.courseName ? ` · ${game.courseName}` : ""}
                            {` · ${holesPlayed} holes`}
                          </p>
                        </div>
                      </div>
                      {userScore != null && (
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary-700 dark:text-primary-400">{userScore}</p>
                          <p className="text-xs text-gray-400">pts</p>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
