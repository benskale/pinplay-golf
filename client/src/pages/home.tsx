import { useLocation, useSearch } from "wouter";
import GameSetup from "@/components/game-setup";
import { useAuth } from "@/hooks/use-auth";
import { User } from "lucide-react";
import { useEffect } from "react";

export default function Home() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();

  // If someone arrives via ?ref= link and isn't logged in, send them to sign up
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.has("ref") && user === null) {
      // Small delay to let auth check complete
      const t = setTimeout(() => setLocation("/auth"), 300);
      return () => clearTimeout(t);
    }
  }, [search, user, setLocation]);

  return (
    <div className="min-h-screen bg-background font-sans">
      {/* ── Premium hero ── */}
      <div className="relative" style={{ background: "radial-gradient(ellipse 80% 55% at 50% 35%, #2e7d52 0%, #0f3520 55%, #081f10 100%)" }}>
        <div className="max-w-md mx-auto px-6 pt-10 pb-20 text-center relative">

          {/* Profile button — top right */}
          <div className="absolute top-0 right-0">
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
        <GameSetup onGameCreated={(id) => setLocation(`/game/${id}`)} />
      </main>
    </div>
  );
}
