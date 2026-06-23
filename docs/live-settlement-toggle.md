# Live Settlement + Leaderboard Toggle — Design

## Problem

During an active game, players can see points on the leaderboard, but there's no
real-time "who owes whom" money breakdown. The settlement card only appears at
the end of the round. Players want to see live dollar standings mid-round.

Additionally, the leaderboard is fixed in points mode. For games with a dollar
value, players should toggle between points and dollars.

---

## Feature 1: Points/$ Leaderboard Toggle

### Current State
- `leaderboard.tsx` sorts by `game.totalScores[player]` (raw points)
- `active-game.tsx` shows dollar amounts *next to* points when `pointValue > 0`
- No toggle — both are always visible or neither

### Design

Add a segmented toggle pill at the top of the Leaderboard section in
`active-game.tsx`:

```
┌─────────────────────────────┐
│  [ Points ] [ Dollars ]     │  ← toggle pill
├─────────────────────────────┤
│  🥇 Ben           +12       │
│  🥈 Patrick        -4       │
│  🥉 Nick           -5       │
│  4th Mekiel        -3       │
└─────────────────────────────┘
```

**Points mode** (current behavior):
- Shows raw points: `+12`, `-4`, etc.
- Color: green for positive, red for negative

**Dollars mode** (new):
- Shows `$60`, `-$20`, etc. (points × pointValue)
- Same color logic
- Only available when `pointValue > 0`
- When `pointValue === 0`, toggle hidden entirely (tracking-only games)

### Implementation

**File:** `client/src/components/active-game.tsx`

```typescript
// New state
const [leaderboardView, setLeaderboardView] = useState<"points" | "dollars">("points");

// In the leaderboard section, before the sorted players list:
{pointValue > 0 && (
  <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
    <button
      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
        leaderboardView === "points"
          ? "bg-white dark:bg-gray-700 shadow-sm"
          : "text-muted-foreground"
      }`}
      onClick={() => setLeaderboardView("points")}
    >
      Points
    </button>
    <button
      className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
        leaderboardView === "dollars"
          ? "bg-white dark:bg-gray-700 shadow-sm"
          : "text-muted-foreground"
      }`}
      onClick={() => setLeaderboardView("dollars")}
    >
      Dollars
    </button>
  </div>
)}
```

Then in each leaderboard row, conditionally render:

```typescript
{leaderboardView === "dollars" ? (
  <span className="text-xl font-bold tabular-nums">
    {(total > 0 ? "+" : "")}${Math.round(total * pointValue)}
  </span>
) : (
  <span className="text-xl font-bold tabular-nums">
    {total > 0 ? `+${total}` : total}
  </span>
)}
```

### Edge Cases
- **pointValue = 0:** Toggle hidden. Leaderboard stays in points mode.
- **lowerIsBetter games (stroke play):** Points are negative for good scores.
  Dollar mode inverts the sign for display (lower strokes = winning money).
  Actually, stroke play doesn't use pointValue — it's stroke-based, not
  points-based. Toggle only shows for games where `lowerIsBetter === false`.
- **Wolf:** Wolf counts (X times) still shown in both modes as subtitle text.

---

## Feature 2: Live Settlement Card (Who Owes Whom)

### Current State
- `final-standings.tsx` has a "Game Payout" card showing each player's net $ amount
- It only appears when the game is completed
- No pairwise "Ben owes Patrick $20" breakdown exists anywhere

### Design

Add a **live settlement card** to the active game view (below the leaderboard),
visible whenever `pointValue > 0`. This card shows:

1. **Net position** per player (same as final standings, but live)
2. **Pairwise debts** — who specifically owes whom

```
┌──────────────────────────────────────────┐
│  💰 Live Settlement              $5/point │
├──────────────────────────────────────────┤
│                                          │
│  Ben              +$60                   │
│  Patrick          -$20                   │
│  Nick             -$25                   │
│  Mekiel           -$15                   │
│                                          │
│  ────────────────────────────────        │
│                                          │
│  Who Owes Whom:                          │
│  Patrick → Ben      $20                  │
│  Nick → Ben         $25                  │
│  Mekiel → Ben       $15                  │
│                                          │
└──────────────────────────────────────────┘
```

### Settlement Calculation

For "per_point" games (most common), the net balance per player is:

```
netDollars[player] = totalScores[player] × pointValue
```

For pairwise debts, use a **debt settlement algorithm** that minimizes
transactions:

```typescript
function calculatePairwiseDebts(
  netBalances: Record<string, number>
): { from: string; to: string; amount: number }[] {

  // Split into creditors (positive) and debtors (negative)
  const creditors = Object.entries(netBalances)
    .filter(([_, bal]) => bal > 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([name, bal]) => ({ name, amount: bal }));

  const debtors = Object.entries(netBalances)
    .filter(([_, bal]) => bal < -0.5)
    .sort((a, b) => a[1] - b[1])  // most negative first
    .map(([name, bal]) => ({ name, amount: -bal }));  // flip to positive

  const transactions: { from: string; to: string; amount: number }[] = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const payment = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.name,
      to: creditor.name,
      amount: Math.round(payment),
    });

    debtor.amount -= payment;
    creditor.amount -= payment;

    if (debtor.amount < 0.5) i++;
    if (creditor.amount < 0.5) j++;
  }

  return transactions;
}
```

This greedy algorithm produces the minimum number of transactions. For 4
players it typically yields 2-3 payments instead of every-to-every.

### Implementation

**New file:** `client/src/lib/settlement.ts`

```typescript
import type { Game } from "@shared/schema";

export function getLiveSettlement(
  game: Game
): {
  netBalances: Record<string, number>;
  transactions: { from: string; to: string; amount: number }[];
  pointValue: number;
} {
  const pointValue = (game.gameSettings as any)?.pointValue || 0;
  if (pointValue === 0) {
    return { netBalances: {}, transactions: [], pointValue: 0 };
  }

  const netBalances: Record<string, number> = {};
  game.players.forEach(p => {
    netBalances[p] = (game.totalScores[p] ?? 0) * pointValue;
  });

  const transactions = calculatePairwiseDebts(netBalances);

  return { netBalances, transactions, pointValue };
}
```

**New file:** `client/src/components/live-settlement.tsx`

A card component that receives the Game object, calls `getLiveSettlement()`,
and renders:
- Net balance per player (sorted high to low, color-coded)
- Divider
- Pairwise transactions ("Patrick → Ben $20")

This card auto-updates in real time because it receives the `game` prop which
is synced via WebSocket. No polling needed.

**Integration in `active-game.tsx`:**

```typescript
import { LiveSettlement } from "@/components/live-settlement";

// In the leaderboard tab, after the Leaderboard card:
{pointValue > 0 && !lower && game.holeHistory.length > 0 && (
  <LiveSettlement game={game} />
)}
```

### Where It Appears
- Below the leaderboard in the active game view
- Only when `pointValue > 0` (money game)
- Only after at least 1 hole is scored (no debt when all are at 0)
- Does NOT appear for stroke-play games (lowerIsBetter) — those don't use
  per-point dollar values

### Edge Cases
- **All players at 0 (start of round):** Card hidden until first hole scored
- **Wolf with presses:** Press multipliers are already baked into totalScores
  points, so settlement calculation is the same
- **Side games (birdie pool, snake, etc.):** These are separate from the main
  game settlement. Phase 2 enhancement: add side game settlements to the card
  as sub-sections
- **Nassau:** Has 3 separate bets (front/back/total). Phase 2: show 3
  settlement rows instead of 1
- **Tied players:** If two players have the same balance, no transaction
  between them

---

## Feature 3: Edit Previous Hole Scores (Already Exists)

This is already built and working:

1. Go to **Scorecard** tab during active game
2. Tap any completed hole's score cell (pencil icon appears on hover/tap)
3. `EditHoleModal` opens with +/- buttons per player
4. Save → `gameActions.editHole()` sends update via WebSocket
5. All devices sync immediately

**Files involved:**
- `client/src/components/scorecard.tsx` — `onEditHole` prop on ScoreCell
- `client/src/components/edit-hole-modal.tsx` — the modal UI
- `client/src/components/active-game.tsx` — wires modal to game actions
- `server/routes.ts` — WebSocket handler for edit_hole events

No changes needed. If the user isn't seeing it, the game may need a refresh
or the scorecard tab needs to be scrolled to show completed holes.

---

## Implementation Order

1. **settlement.ts** — pure calculation function, testable in isolation
2. **live-settlement.tsx** — card component, takes game prop
3. **active-game.tsx** — add the points/$ toggle + mount LiveSettlement card
4. Test with a live 4-player game with pointValue set

All three changes (toggle + settlement card) are client-side only — no
server changes, no database migration, no WebSocket protocol changes.
They read from existing `game.totalScores` and `game.gameSettings` data
that's already syncing in real time.
