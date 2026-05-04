import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Crown, Award, RotateCcw, TableProperties, ClipboardList } from "lucide-react";
import { ShareModal } from "@/components/share-modal";
import { GhinExportModal } from "@/components/ghin-export-modal";
import Scorecard from "@/components/scorecard";
import { useState } from "react";
import type { Game } from "@shared/schema";
import { GAME_DEFINITIONS, isLowerBetter } from "@/lib/game-logic";

interface FinalStandingsProps {
  game: Game;
  onNewGame: () => void;
}

export function FinalStandings({ game, onNewGame }: FinalStandingsProps) {
  const [showShareModal, setShowShareModal] = useState(false);
  const [showGhinModal, setShowGhinModal] = useState(false);

  const gameDef = GAME_DEFINITIONS[game.gameType];
  const gameName = gameDef?.name ?? game.gameType;
  const lower = isLowerBetter(game.gameType);
  const isWolfGame = game.gameType === "wolf" || game.gameType === "wolf_3";

  // Count hole wins per player
  const holeWins: Record<string, number> = {};
  game.players.forEach(p => { holeWins[p] = 0; });
  game.holeHistory.forEach(hole => {
    const vals = Object.values(hole.points);
    const best = lower ? Math.min(...vals) : Math.max(...vals);
    if (lower ? best < 999 : best > 0) {
      Object.entries(hole.points).forEach(([player, pts]) => {
        if (pts === best) holeWins[player]++;
      });
    }
  });

  // Sort players — lower-is-better games sort ascending
  const sortedPlayers = [...game.players].sort((a, b) => {
    const sa = game.totalScores[a] ?? 0;
    const sb = game.totalScores[b] ?? 0;
    return lower ? sa - sb : sb - sa;
  });

  const winner = sortedPlayers[0];
  const winnerScore = game.totalScores[winner] ?? 0;

  const getPositionIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (index === 1) return <Award className="w-6 h-6 text-gray-400" />;
    if (index === 2) return <Award className="w-6 h-6 text-amber-600" />;
    return (
      <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center">
        <span className="text-xs font-bold text-gray-600">{index + 1}</span>
      </div>
    );
  };

  const getPositionBg = (index: number) => {
    if (index === 0) return "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800";
    if (index === 1) return "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700";
    if (index === 2) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="text-white shadow-lg" style={{ background: "linear-gradient(160deg, #081f10 0%, #0f3520 60%, #155e35 100%)" }}>
        <div className="max-w-md mx-auto px-4 py-6 text-center">
          <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-300" />
          <h1 className="text-2xl font-bold">Game Complete!</h1>
          <p style={{ color: "rgba(134,196,159,0.85)" }}>{gameName} — Final Results</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Winner */}
        <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-6 text-center">
            <Crown className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
              🏆 {winner} Wins!
            </h2>
            <p className="text-lg text-yellow-700 dark:text-yellow-300 font-semibold">
              {lower ? `${winnerScore} strokes` : `${winnerScore} points`}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Congratulations on a great round!
            </p>
          </CardContent>
        </Card>

        {/* Final Standings */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Final Standings</h3>
            <div className="space-y-3">
              {sortedPlayers.map((player, index) => (
                <div key={player} className={`flex items-center justify-between p-4 rounded-lg border ${getPositionBg(index)}`}>
                  <div className="flex items-center space-x-4">
                    {getPositionIcon(index)}
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">{player}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {holeWins[player]} holes won
                        {isWolfGame && ` • Wolf ${game.wolfCounts?.[player] ?? 0}×`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary-700 dark:text-primary-400">
                      {game.totalScores[player] ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {lower ? "strokes" : "points"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Game Summary */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Game Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">
                  {game.holeHistory.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Holes Played</p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">
                  {game.players.length}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Players</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Full Scorecard */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center space-x-2 mb-4">
              <TableProperties className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Full Scorecard</h3>
            </div>
            <Scorecard game={game} />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="space-y-3 pb-8">
          <Button
            className="w-full bg-primary-700 hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700 text-white py-3 rounded-xl font-semibold"
            onClick={() => setShowShareModal(true)}
          >
            Share Final Results
          </Button>
          <Button
            variant="outline"
            className="w-full border-primary-500 text-primary-700 hover:bg-primary-50 dark:text-primary-400 dark:border-primary-400 dark:hover:bg-primary-950 py-3 rounded-xl font-semibold"
            onClick={() => setShowGhinModal(true)}
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            Post to GHIN
          </Button>
          <Button
            variant="outline"
            className="w-full border-gray-300 text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-800 py-3 rounded-xl"
            onClick={onNewGame}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Start New Game
          </Button>
        </div>
      </main>

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        gameId={game.id}
      />
      <GhinExportModal
        isOpen={showGhinModal}
        onClose={() => setShowGhinModal(false)}
        game={game}
      />
    </div>
  );
}
