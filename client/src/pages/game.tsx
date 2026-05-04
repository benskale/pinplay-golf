import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { useGame } from "@/hooks/use-game";
import ActiveGame from "@/components/active-game";
import { FinalStandings } from "@/components/final-standings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Users } from "lucide-react";
import PinPlayLogo from "@/components/logo";
import { Skeleton } from "@/components/ui/skeleton";
import type { Game } from "@shared/schema";

interface GameParams {
  gameId: string;
}

function getStoredPlayer(gameId: string): string | null {
  try {
    return localStorage.getItem(`wolf-tracker-player-${gameId}`);
  } catch {
    return null;
  }
}

function storePlayer(gameId: string, playerName: string) {
  try {
    localStorage.setItem(`wolf-tracker-player-${gameId}`, playerName);
  } catch {}
}

export default function Game() {
  const { gameId } = useParams<GameParams>();
  const [, setLocation] = useLocation();

  const { data: game, isLoading, error } = useQuery<Game>({
    queryKey: ["/api/games", gameId],
    enabled: !!gameId,
  });

  const { game: wsGame, sendMessage } = useWebSocket(gameId);

  const currentGame = wsGame || game;
  const gameActions = useGame(gameId, sendMessage, currentGame);

  // Player identity
  const [myPlayer, setMyPlayer] = useState<string | null>(() =>
    gameId ? getStoredPlayer(gameId) : null
  );
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);

  // Show player picker once game data is loaded and no player is selected
  useEffect(() => {
    if (currentGame && !myPlayer) {
      setShowPlayerPicker(true);
    }
  }, [!!currentGame, myPlayer]);

  const handleSelectPlayer = (name: string) => {
    setMyPlayer(name);
    if (gameId) storePlayer(gameId, name);
    setShowPlayerPicker(false);
  };

  const handleNewGame = () => {
    setLocation("/");
  };

  if (isLoading || !currentGame) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 font-sans min-h-screen">
        <header className="bg-primary-700 dark:bg-primary-800 text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center space-x-3">
              <PinPlayLogo className="w-8 h-8" />
              <h1 className="text-xl font-bold">PinPlay Golf</h1>
            </div>
          </div>
        </header>
        <main className="max-w-md mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 font-sans min-h-screen">
        <header className="bg-primary-700 dark:bg-primary-800 text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-md mx-auto px-4 py-4">
            <div className="flex items-center space-x-3">
              <PinPlayLogo className="w-8 h-8" />
              <h1 className="text-xl font-bold">PinPlay Golf</h1>
            </div>
          </div>
        </header>
        <main className="max-w-md mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex mb-4 gap-2">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Game Not Found</h1>
              </div>
              <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                The game you're looking for doesn't exist or has been removed.
              </p>
              <Button className="mt-4 w-full" onClick={() => window.location.href = "/"}>
                Create New Game
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (currentGame && !currentGame.active) {
    return <FinalStandings game={currentGame} onNewGame={handleNewGame} />;
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 font-sans min-h-screen">
      <ActiveGame game={currentGame} myPlayer={myPlayer ?? undefined} gameActions={gameActions} />

      {/* Player Identity Picker */}
      {showPlayerPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl shadow-xl p-6 pb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-primary-700 dark:text-primary-300" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Who are you?</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Select your name to track your scores</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {currentGame.players.map((player) => (
                <button
                  key={player}
                  onClick={() => handleSelectPlayer(player)}
                  className="w-full flex items-center space-x-3 p-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors text-left"
                >
                  <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                      {player.split(" ").map(p => p[0]).join("").toUpperCase().slice(0, 2)}
                    </span>
                  </div>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{player}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowPlayerPicker(false)}
              className="w-full text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 py-2"
            >
              Skip — I'm just watching
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
