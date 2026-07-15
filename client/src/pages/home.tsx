import { useLocation, useSearch } from "wouter";
import GameSetup from "@/components/game-setup";
import Onboarding from "@/components/onboarding";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { User, Play, ChevronRight, Trophy, ArrowRight, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import type { Game } from "@shared/schema";
import { GAME_DEFINITIONS } from "@/lib/game-logic";
import { resolveTrackedGames } from "@/lib/game-recovery";

const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

export default function Home() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("pinplay_onboarding_seen");
    if (!seen) {
      // Small delay so the page renders first
      const t = setTimeout(() => setShowOnboarding(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  // If someone arrives via ?ref= link and isn't logged in, send them to sign up
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.has("ref") && user === null) {
      const t = setTimeout(() => setLocation("/auth"), 300);
      return () => clearTimeout(t);
    }
  }, [search, user, setLocation]);

  // Fetch all games for logged-in user (active + completed)
  const { data: myGames = [] } = useQuery<Game[]>({
    queryKey: ["/api/auth/games"],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/auth/games", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  const activeGames = myGames.filter(g => g.active);
  const completedGames = myGames.filter(g => !g.active);
  const mostRecentActive = activeGames.length > 0 ? activeGames[0] : null;

  // Guest game recovery - check localStorage for active games
  const { data: guestGames = [] } = useQuery<Game[]>({
    queryKey: ["guest-games"],
    queryFn: resolveTrackedGames,
    staleTime: 10_000,
  });

  // For guests (not logged in), use recovered games
  const guestActiveGames = user ? [] : guestGames.filter(g => g.active);
  const guestMostRecent = guestActiveGames.length > 0 ? guestActiveGames[0] : null;

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* ── Premium hero ── */}
      <div className="relative hero-texture" style={{ background: "radial-gradient(ellipse 70% 50% at 50% 40%, #1a3a2a 0%, #0d1f15 50%, #070f0a 100%)" }}>
        <div className="max-w-md mx-auto px-6 pt-10 pb-20 text-center relative">

          {/* Profile button — top right */}
          <div className="absolute top-4 right-2">
            <button
              onClick={() => setLocation(user ? "/profile" : "/auth")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}
            >
              <User className="w-3.5 h-3.5" />
              {user ? user.name.split(" ")[0] : "Sign In"}
            </button>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-3">
            <img
              src="/logo-dark.png"
              alt="PinPlay Golf"
              className="w-56 h-auto drop-shadow-2xl"
              data-testid="app-title"
            />
          </div>
          <p className="text-[0.9375rem] font-medium" style={{ color: "rgba(134,196,159,0.85)" }}>
            Score every format, every round
          </p>
        </div>

        {/* Curved edge into content */}
        <div
          className="absolute bottom-0 left-0 right-0 h-10 bg-background"
          style={{ borderRadius: "2.5rem 2.5rem 0 0" }}
        />
      </div>

      {/* ── Setup content ── */}
      <main className="max-w-md mx-auto px-4 pb-24 -mt-1">

        {/* ── Continue Round Banner (prominent CTA) ── */}
        {(mostRecentActive || guestMostRecent) && (() => {
          const game = mostRecentActive || guestMostRecent!;
          return (
          <div className="mb-5 -mt-1">
            <button
              onClick={() => setLocation(`/game/${game.id}`)}
              className="w-full p-4 rounded-2xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-lg border-2 border-green-400/50 dark:border-green-600/40 header-surface"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <Play className="w-5 h-5 text-green-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-sm font-bold text-white">Continue Your Round</span>
                    </div>
                    <p className="text-xs text-green-200/80 mt-0.5">
                      {GAME_DEFINITIONS[game.gameType]?.name ?? game.gameType}
                      {game.courseName ? ` · ${game.courseName}` : ""}
                      {" · Hole "}{game.currentHole}
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-green-300 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
              </div>
            </button>
          </div>
          );
        })()}

        {/* Active Games (show remaining ones if multiple) */}
        {(activeGames.length > 1 || guestActiveGames.length > 1) && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                {(mostRecentActive || guestMostRecent) ? "Other Active Games" : "Active Games"}
              </h2>
            </div>
            <div className="space-y-2">
              {[...activeGames.filter(g => g !== mostRecentActive), ...guestActiveGames.filter(g => g !== guestMostRecent)].map(game => {
                const gameDef = GAME_DEFINITIONS[game.gameType];
                const holesPlayed = game.holeHistory?.length ?? 0;
                return (
                  <button
                    key={game.id}
                    onClick={() => setLocation(`/game/${game.id}`)}
                    className="w-full flex items-center justify-between p-3.5 bg-card rounded-xl text-left group transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] shadow-card hover:shadow-card-hover border border-green-200/50 dark:border-green-800/30"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                        <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-50 text-sm truncate">
                          {gameDef?.name ?? game.gameType}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {game.courseName ? `${game.courseName} · ` : ""}
                          Hole {game.currentHole}
                          {holesPlayed > 0 ? ` (${holesPlayed} played)` : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Completed Games */}
        {completedGames.length > 0 && activeGames.length <= 1 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-3.5 h-3.5 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-400">Recent Rounds</h2>
            </div>
            <div className="space-y-2">
              {completedGames.slice(0, 3).map(game => {
                const gameDef = GAME_DEFINITIONS[game.gameType];
                return (
                  <button
                    key={game.id}
                    onClick={() => setLocation(`/game/${game.id}`)}
                    className="w-full flex items-center justify-between p-3 bg-card rounded-xl text-left group transition-colors hover:bg-gray-75 dark:hover:bg-gray-800/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{gameDef?.name ?? game.gameType}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {game.courseName ? `${game.courseName} · ` : ""}
                        {new Date(game.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Start Group Play CTA ── */}
        {user && (
          <div className="mt-4">
            <button
              onClick={() => setLocation("/tournament/create")}
              className="w-full py-3 rounded-xl border-2 border-dashed border-amber-500/40 hover:border-amber-400/60 text-amber-400 hover:text-amber-300 transition-all flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <Trophy className="w-4 h-4" />
              Start Group Play
            </button>
          </div>
        )}

        {/* ── Your Group Play ── */}
        {user && (
          <YourTournaments />
        )}

        <GameSetup onGameCreated={(id) => setLocation(`/game/${id}`)} />

        {/* App Store badge — only on web, not in native app */}
        {!isNative() && (
          <div className="flex justify-center mt-8">
            <a
              href="https://apps.apple.com/us/app/pinplay-golf/id6774765586"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 bg-black text-white px-5 py-2.5 rounded-xl hover:bg-gray-900 transition-colors shadow-lg"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              <div className="text-left leading-tight">
                <p className="text-[0.625rem] opacity-80">Download on the</p>
                <p className="text-sm font-semibold -mt-0.5">App Store</p>
              </div>
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 text-center space-y-2">
          <p className="text-xs text-gray-400">© 2026 Silver Springs Ventures LLC</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setLocation("/privacy")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Privacy Policy</button>
            <span className="text-gray-300 dark:text-gray-700">·</span>
            <button onClick={() => setLocation("/terms")} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Terms of Service</button>
          </div>
        </div>
      </main>

      {/* Onboarding overlay */}
      {showOnboarding && <Onboarding onDismiss={() => setShowOnboarding(false)} />}
    </div>
  );
}

// ── Your Tournaments widget ──
function YourTournaments() {
  const [, setLocation] = useLocation();
  const { data: tournaments = [] } = useQuery<any[]>({
    queryKey: ["/api/auth/tournaments"],
    queryFn: async () => {
      const res = await fetch("/api/auth/tournaments", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });

  if (tournaments.length === 0) return null;

  const active = tournaments.filter((t: any) => t.status !== "complete" && t.status !== "cancelled");

  if (active.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-3.5 h-3.5 text-amber-500" />
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Your Group Play</span>
      </div>
      <div className="space-y-2">
        {active.map((t: any) => (
          <button
            key={t.id}
            onClick={() => setLocation(`/tournament/${t.id}`)}
            className="w-full text-left p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-amber-500/30 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{t.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t.courseName || "TBD"} · {t.status === "open" ? "Registration open" : t.status === "in_progress" ? "In progress" : t.status}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
