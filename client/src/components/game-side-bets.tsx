import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, X, Check, Trophy, Handshake, AlertCircle } from "lucide-react";

interface SideBet {
  id: number;
  gameId: string;
  proposerName: string;
  targetNames: string[];
  amount: number;
  betType: string;
  scope: string;
  holeNumber: number | null;
  description: string | null;
  status: string;
  result: { winnerId: number | null; winnerName: string | null; settledAt: string | null };
  createdAt: string;
}

interface GameSideBetsProps {
  gameId: string;
  players: string[];
  currentUser: string;
}

const BET_TYPES = [
  { id: "custom", label: "Custom Bet" },
  { id: "low_net", label: "Low Net (Handicap)" },
  { id: "low_gross", label: "Low Gross" },
  { id: "closest_to_pin", label: "Closest to Pin" },
  { id: "longest_drive", label: "Longest Drive" },
  { id: "most_birdies", label: "Most Birdies" },
];

const SCOPES = [
  { id: "hole", label: "This Hole" },
  { id: "round", label: "This Round" },
  { id: "game", label: "Whole Game" },
];

export default function GameSideBets({ gameId, players, currentUser }: GameSideBetsProps) {
  const [bets, setBets] = useState<SideBet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [targetName, setTargetName] = useState("");
  const [amount, setAmount] = useState("5");
  const [betType, setBetType] = useState("custom");
  const [scope, setScope] = useState("round");
  const [description, setDescription] = useState("");
  const [settlingBetId, setSettlingBetId] = useState<number | null>(null);
  const [settlingWinner, setSettlingWinner] = useState("");

  const fetchBets = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${gameId}/side-bets`, { credentials: "include" });
      if (res.ok) setBets(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [gameId]);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  const otherPlayers = players.filter(p => p !== currentUser);

  const createBet = async () => {
    if (!targetName || !amount) return;
    try {
      await fetch(`/api/games/${gameId}/side-bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          proposerName: currentUser,
          targetNames: [targetName],
          amount: parseFloat(amount),
          betType,
          scope,
          description: description || null,
        }),
      });
      setShowForm(false);
      setTargetName("");
      setAmount("5");
      setBetType("custom");
      setScope("round");
      setDescription("");
      fetchBets();
    } catch { /* ignore */ }
  };

  const updateBet = async (betId: number, status: string, result?: any) => {
    try {
      await fetch(`/api/games/${gameId}/side-bets/${betId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, result }),
      });
      setSettlingBetId(null);
      setSettlingWinner("");
      fetchBets();
    } catch { /* ignore */ }
  };

  const deleteBet = async (betId: number) => {
    try {
      await fetch(`/api/games/${gameId}/side-bets/${betId}`, {
        method: "DELETE",
        credentials: "include",
      });
      fetchBets();
    } catch { /* ignore */ }
  };

  const pending = bets.filter(b => b.status === "pending");
  const active = bets.filter(b => b.status === "accepted");
  const completed = bets.filter(b => b.status === "completed");
  const declined = bets.filter(b => b.status === "declined");

  const betTypeLabel = (id: string) => BET_TYPES.find(t => t.id === id)?.label || id;
  const scopeLabel = (id: string) => SCOPES.find(s => s.id === id)?.label || id;

  const BetCard = ({ bet }: { bet: SideBet }) => {
    const iAmTarget = bet.targetNames.includes(currentUser);
    const iAmProposer = bet.proposerName === currentUser;
    const isSettling = settlingBetId === bet.id;

    return (
      <div className={`rounded-xl border p-3 mb-2 ${
        bet.status === "completed" ? "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700" :
        bet.status === "declined" ? "bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-60" :
        bet.status === "accepted" ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" :
        "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
      }`}>
        <div className="flex items-start justify-between mb-1.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{bet.proposerName}</span>
              <span className="text-[0.6875rem] text-gray-400">vs</span>
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{bet.targetNames.join(", ")}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[0.6875rem] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                ${bet.amount}
              </span>
              <span className="text-[0.6875rem] text-gray-500 dark:text-gray-400">{betTypeLabel(bet.betType)}</span>
              <span className="text-[0.6875rem] text-gray-400">·</span>
              <span className="text-[0.6875rem] text-gray-500 dark:text-gray-400">{scopeLabel(bet.scope)}</span>
            </div>
            {bet.description && (
              <p className="text-[0.6875rem] text-gray-500 dark:text-gray-400 mt-1 italic">"{bet.description}"</p>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {bet.status === "completed" && bet.result?.winnerName && (
              <div className="flex items-center gap-1 text-[0.6875rem] font-medium text-emerald-600 dark:text-emerald-400">
                <Trophy className="w-3 h-3" />
                <span>{bet.result.winnerName}</span>
              </div>
            )}
            {bet.status === "declined" && (
              <span className="text-[0.6875rem] text-gray-400">Declined</span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {bet.status === "pending" && iAmTarget && !isSettling && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => updateBet(bet.id, "accepted")}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Accept
            </button>
            <button
              onClick={() => updateBet(bet.id, "declined")}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        )}

        {bet.status === "pending" && iAmProposer && !isSettling && (
          <button
            onClick={() => deleteBet(bet.id)}
            className="mt-2 text-[0.6875rem] text-gray-400 hover:text-red-500 transition-colors"
          >
            Cancel bet
          </button>
        )}

        {/* Settle UI */}
        {bet.status === "accepted" && !isSettling && (iAmProposer || iAmTarget) && (
          <button
            onClick={() => { setSettlingBetId(bet.id); setSettlingWinner(""); }}
            className="mt-2 w-full px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors flex items-center justify-center gap-1"
          >
            <Handshake className="w-3.5 h-3.5" /> Settle Bet
          </button>
        )}

        {isSettling && (
          <div className="mt-2 space-y-2">
            <p className="text-[0.6875rem] font-medium text-gray-600 dark:text-gray-400">Who won?</p>
            <div className="flex gap-1.5 flex-wrap">
              {[bet.proposerName, ...bet.targetNames].map(name => (
                <button
                  key={name}
                  onClick={() => setSettlingWinner(name)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    settlingWinner === name
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                  }`}
                >
                  {name}
                </button>
              ))}
              <button
                onClick={() => setSettlingWinner("tie")}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  settlingWinner === "tie"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                }`}
              >
                Tie
              </button>
            </div>
            {settlingWinner && (
              <div className="flex gap-2">
                <button
                  onClick={() => updateBet(bet.id, "completed", { winnerName: settlingWinner })}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => { setSettlingBetId(null); setSettlingWinner(""); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return null;

  // Don't render if only 1 player (no one to bet with)
  if (otherPlayers.length === 0) return null;

  return (
    <Card className="border-violet-200 dark:border-violet-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
            <Handshake className="w-4 h-4 text-violet-500" />
            Side Bets
          </h3>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setTargetName(otherPlayers[0] || ""); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Bet
            </button>
          )}
        </div>

        {/* New bet form */}
        {showForm && (
          <div className="space-y-3 mb-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
            {/* Target selection */}
            <div>
              <label className="text-[0.6875rem] font-medium text-gray-600 dark:text-gray-400 mb-1 block">Who are you betting?</label>
              <div className="flex gap-1.5 flex-wrap">
                {otherPlayers.map(name => (
                  <button
                    key={name}
                    onClick={() => setTargetName(name)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      targetName === name
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="text-[0.6875rem] font-medium text-gray-600 dark:text-gray-400 mb-1 block">Amount ($)</label>
              <div className="flex gap-1.5">
                {["5", "10", "20", "50"].map(val => (
                  <button
                    key={val}
                    onClick={() => setAmount(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      amount === val
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    ${val}
                  </button>
                ))}
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-16 px-2 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  min="1"
                />
              </div>
            </div>

            {/* Bet type */}
            <div>
              <label className="text-[0.6875rem] font-medium text-gray-600 dark:text-gray-400 mb-1 block">Type</label>
              <select
                value={betType}
                onChange={e => setBetType(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                {BET_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Scope */}
            <div>
              <label className="text-[0.6875rem] font-medium text-gray-600 dark:text-gray-400 mb-1 block">Scope</label>
              <div className="flex gap-1.5">
                {SCOPES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setScope(s.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                      scope === s.id
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description (optional) */}
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional: describe the bet..."
              className="w-full px-2 py-1.5 rounded-lg text-xs border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              maxLength={100}
            />

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={createBet}
                disabled={!targetName || !amount}
                className="flex-1 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 disabled:dark:bg-gray-700 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
              >
                Propose Bet
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Pending bets */}
        {pending.length > 0 && (
          <div className="mb-2">
            {pending.map(bet => <BetCard key={bet.id} bet={bet} />)}
          </div>
        )}

        {/* Active bets */}
        {active.length > 0 && (
          <div className="mb-2">
            {active.map(bet => <BetCard key={bet.id} bet={bet} />)}
          </div>
        )}

        {/* Completed bets */}
        {completed.length > 0 && (
          <div className="mb-2">
            {completed.map(bet => <BetCard key={bet.id} bet={bet} />)}
          </div>
        )}

        {/* Declined bets */}
        {declined.length > 0 && (
          <div className="mb-2">
            {declined.map(bet => <BetCard key={bet.id} bet={bet} />)}
          </div>
        )}

        {/* Empty state */}
        {bets.length === 0 && !showForm && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">
            No side bets yet. Tap "New Bet" to propose one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
