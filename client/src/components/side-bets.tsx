import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Plus, Trash2, DollarSign, Check, X, Loader2, Handshake, Trophy
} from "lucide-react";

interface SideBet {
  id: number;
  tournamentId: string;
  gameId: string | null;
  proposerId: number | null;
  proposerName: string;
  targetIds: number[];
  amount: number;
  betType: string;
  scope: string;
  holeNumber: number | null;
  description: string | null;
  status: string;
  result: {
    winnerId: number | null;
    winnerName: string | null;
    settledAt: string | null;
  };
  createdAt: string;
}

interface TournamentPlayer {
  id: number;
  playerName: string;
  userId: number | null;
  avatarUrl: string | null;
}

interface Props {
  tournamentId: string;
  players: TournamentPlayer[];
  currentUserName: string | null;
}

const BET_TYPE_LABELS: Record<string, string> = {
  closest_to_pin: "Closest to Pin",
  longest_drive: "Longest Drive",
  most_birdies: "Most Birdies",
  low_net: "Lowest Net Score",
  low_gross: "Lowest Gross Score",
  custom: "Custom Wager",
};

const SCOPE_LABELS: Record<string, string> = {
  hole: "This Hole",
  round: "This Round",
  tournament: "Whole Tournament",
};

export function SideBets({ tournamentId, players, currentUserName }: Props) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState("5");
  const [betType, setBetType] = useState("low_net");
  const [scope, setScope] = useState("round");
  const [description, setDescription] = useState("");
  const [targetIds, setTargetIds] = useState<number[]>([]);

  const { data: bets = [], refetch } = useQuery<SideBet[]>({
    queryKey: ["/api/tournaments", tournamentId, "side-bets"],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/side-bets`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tournaments", tournamentId, "side-bets"] });
    refetch();
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/side-bets`, {
        proposerName: currentUserName || "Anonymous",
        targetIds,
        amount: parseFloat(amount) || 0,
        betType,
        scope,
        description: description || null,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setAmount("5");
      setDescription("");
      setTargetIds([]);
    },
  });

  const respondMutation = useMutation({
    mutationFn: async ({ betId, status }: { betId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/tournaments/${tournamentId}/side-bets/${betId}`, { status });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const settleMutation = useMutation({
    mutationFn: async ({ betId, winnerId, winnerName }: { betId: number; winnerId: number; winnerName: string }) => {
      const res = await apiRequest("PATCH", `/api/tournaments/${tournamentId}/side-bets/${betId}`, {
        status: "completed",
        result: { winnerId, winnerName },
      });
      return res.json();
    },
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (betId: number) => {
      await apiRequest("DELETE", `/api/tournaments/${tournamentId}/side-bets/${betId}`);
    },
    onSuccess: () => invalidate(),
  });

  const toggleTarget = (id: number) => {
    if (targetIds.includes(id)) setTargetIds(targetIds.filter(t => t !== id));
    else setTargetIds([...targetIds, id]);
  };

  // Total settled
  const totalSettled = bets.filter(b => b.status === "completed").length;
  const totalPot = bets.filter(b => b.status === "accepted" || b.status === "completed").reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Handshake className="w-3.5 h-3.5" />
          {bets.length} bet{bets.length !== 1 ? "s" : ""}
        </span>
        {totalPot > 0 && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            {totalPot.toFixed(0)} at stake
          </span>
        )}
      </div>

      {/* Add Button */}
      {!showAdd && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAdd(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Propose Side Bet
        </Button>
      )}

      {/* Add Form */}
      {showAdd && (
        <Card className="border-0 shadow-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Propose a Side Bet</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Type</label>
                <select
                  value={betType}
                  onChange={e => setBetType(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
                >
                  {Object.entries(BET_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Amount ($)</label>
                <Input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="text-sm"
                  min="0"
                  step="1"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Scope</label>
              <div className="flex gap-2">
                {Object.entries(SCOPE_LABELS).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setScope(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      scope === v
                        ? "bg-primary-600 text-white"
                        : "bg-secondary-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Challenge who?</label>
              <div className="flex flex-wrap gap-1.5">
                {players.map(p => (
                  <button
                    key={p.id}
                    onClick={() => toggleTarget(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                      targetIds.includes(p.id)
                        ? "bg-primary-600 text-white"
                        : "bg-secondary-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {p.playerName}
                  </button>
                ))}
              </div>
            </div>

            {betType === "custom" && (
              <Input
                placeholder="Description (e.g. 'I beat you on the front 9')"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="text-sm"
              />
            )}

            <Button
              size="sm"
              className="w-full"
              disabled={createMutation.isPending || targetIds.length === 0}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Challenge"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Bet List */}
      {bets.length === 0 && !showAdd ? (
        <Card className="border-0 shadow-card">
          <CardContent className="p-6 text-center text-sm text-gray-400">
            <DollarSign className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            No side bets yet. Propose one to spice things up.
          </CardContent>
        </Card>
      ) : (
        bets.map(bet => {
          const isPending = bet.status === "pending";
          const isAccepted = bet.status === "accepted";
          const isCompleted = bet.status === "completed";
          const targetNames = bet.targetIds
            .map(id => players.find(p => p.id === id)?.playerName)
            .filter(Boolean)
            .join(", ");

          return (
            <Card key={bet.id} className={`border-0 shadow-card ${isCompleted ? "opacity-70" : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                        {BET_TYPE_LABELS[bet.betType] || bet.betType}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold">
                        ${bet.amount}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{bet.proposerName}</span>
                      {" vs "}
                      <span className="font-medium text-gray-700 dark:text-gray-300">{targetNames || "Everyone"}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {SCOPE_LABELS[bet.scope] || bet.scope}
                      {bet.description ? ` · ${bet.description}` : ""}
                    </p>

                    {/* Status badge */}
                    {isCompleted && bet.result?.winnerName && (
                      <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <Trophy className="w-3 h-3" />
                        {bet.result.winnerName} won ${bet.amount}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isPending && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-green-600 hover:bg-green-50"
                          onClick={() => respondMutation.mutate({ betId: bet.id, status: "accepted" })}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                          onClick={() => respondMutation.mutate({ betId: bet.id, status: "declined" })}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {isAccepted && (
                      <div className="flex items-center gap-1">
                        <select
                          className="text-xs border rounded px-2 py-1 bg-background"
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) {
                              const player = players.find(p => p.id === parseInt(e.target.value));
                              if (player) settleMutation.mutate({ betId: bet.id, winnerId: player.id, winnerName: player.playerName });
                            }
                          }}
                        >
                          <option value="" disabled>Settle...</option>
                          <option value={bet.proposerId ?? -1}>{bet.proposerName}</option>
                          {bet.targetIds.map(id => {
                            const p = players.find(pp => pp.id === id);
                            return p ? <option key={id} value={id}>{p.playerName}</option> : null;
                          })}
                        </select>
                      </div>
                    )}
                    {isPending && (
                      <span className="text-xs text-gray-400">Waiting...</span>
                    )}
                    {isAccepted && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">Live</span>
                    )}
                    {isCompleted && (
                      <span className="text-xs text-gray-400">Done</span>
                    )}
                    {/* Delete (proposer or always for completed) */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-300 hover:text-red-500"
                      onClick={() => deleteMutation.mutate(bet.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
