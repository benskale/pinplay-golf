# PinPlay Custom Game Config Schema

## Overview

A modular JSON format that describes any golf game as a combination of building blocks.
The AI natural-language parser generates this config; the PinPlay game engine interprets it.

This schema can express every existing game in PinPlay AND unlimited new combinations.

---

## Top-Level Structure

```typescript
interface GameConfig {
  meta: GameMeta;
  scoring: ScoringConfig;
  teams: TeamConfig;
  payouts: PayoutConfig;
  sideGames?: SideGameConfig[];
  modifiers?: ModifierConfig;
  handicaps?: HandicapConfig;
}
```

---

## 1. GameMeta — identification

```typescript
interface GameMeta {
  name: string;              // Display name, e.g. "Wolf with Birdies"
  description: string;       // Human-readable description
  createdBy?: "preset" | "ai" | "user";  // Source
  minPlayers: number;        // Minimum players (2-4)
  maxPlayers: number;        // Maximum players (2-4)
  icon?: string;             // Emoji or icon identifier
}
```

**Example:**
```json
{
  "name": "Wolf with Birdies and Presses",
  "description": "4-player rotating Wolf, $5/point, presses allowed, $10 birdie pool",
  "minPlayers": 4,
  "maxPlayers": 4
}
```

---

## 2. ScoringConfig — how each hole is scored

This is the core of the system. Every game mode is ultimately "how do we determine who wins each hole and how many points."

```typescript
interface ScoringConfig {
  // ── SCORING BASIS ──
  // How the winner of each hole is determined
  basis: "match" | "stroke" | "skins" | "points";

  // ── HOLE WIN DETERMINATION ──
  // "gross" = raw strokes, "net" = after handicap strokes
  winBy: "gross" | "net";

  // ── POINT ALLOCATION PER HOLE ──
  // Only used when basis = "points" or "match"
  pointAllocation: {
    type: "win_loss_halve"     // Match play: +1 win, 0 halve, -1 loss
       | "fixed_split"         // Fixed points split by finish (e.g., 9-Point: 5-3-1)
       | "quota"               // Stableford: points vs par (eagle=2, birdie=1, etc.)
       | "skins_pot"           // Winner takes accumulated pot
       | "wolf_team"           // Wolf-specific: wolf picks partner or goes lone
       | "veas_multiplier";    // Vegas: combine team scores into 2-digit number

    // For "fixed_split" type
    splitValues?: number[];    // e.g., [5, 3, 1] for 9-Point
    tieSplit?: "even" | "carryover";  // How ties are handled

    // For "quota" type
    quotaTable?: {
      double_eagle?: number;   // default: 5
      eagle?: number;          // default: 3
      birdie?: number;         // default: 2
      par?: number;            // default: 1
      bogey?: number;          // default: 0
      double_bogey_plus?: number; // default: -1
    };

    // For "skins_pot" type
    baseSkinValue?: number;    // default: 1 point per hole
    carryoverOnTie?: boolean;  // default: true

    // For "wolf_team" type
    loneWolfMultiplier?: number;  // default: 2 (lone wolf wins/loses double)
    partnerPickTiming?: "tee_shot" | "before_tee" | "after_all_drive";  // when wolf picks
  };

  // ── LOWER IS BETTER ──
  // Stroke play: true. Match/points: false.
  lowerIsBetter: boolean;

  // ── TIE HANDLING ──
  tiesCarry: boolean;  // If true, points/skins carry over to next hole
}
```

**Examples by existing game:**

Match Play:
```json
{
  "basis": "match",
  "winBy": "gross",
  "pointAllocation": { "type": "win_loss_halve" },
  "lowerIsBetter": false,
  "tiesCarry": false
}
```

9-Point:
```json
{
  "basis": "points",
  "winBy": "gross",
  "pointAllocation": { "type": "fixed_split", "splitValues": [5, 3, 1], "tieSplit": "even" },
  "lowerIsBetter": false,
  "tiesCarry": false
}
```

Skins:
```json
{
  "basis": "skins",
  "winBy": "gross",
  "pointAllocation": { "type": "skins_pot", "baseSkinValue": 1, "carryoverOnTie": true },
  "lowerIsBetter": false,
  "tiesCarry": true
}
```

Wolf:
```json
{
  "basis": "points",
  "winBy": "gross",
  "pointAllocation": {
    "type": "wolf_team",
    "loneWolfMultiplier": 2,
    "partnerPickTiming": "tee_shot"
  },
  "lowerIsBetter": false,
  "tiesCarry": false
}
```

Stableford/Quota:
```json
{
  "basis": "points",
  "winBy": "net",
  "pointAllocation": {
    "type": "quota",
    "quotaTable": { "eagle": 3, "birdie": 2, "par": 1, "bogey": 0 }
  },
  "lowerIsBetter": false,
  "tiesCarry": false
}
```

Stroke Play:
```json
{
  "basis": "stroke",
  "winBy": "net",
  "pointAllocation": { "type": "win_loss_halve" },
  "lowerIsBetter": true,
  "tiesCarry": false
}
```

---

## 3. TeamConfig — who plays with whom

```typescript
interface TeamConfig {
  // ── TEAM STRUCTURE ──
  structure: "solo"           // Every player for themselves
             | "fixed_teams"  // Teams set at game start (2v2, etc.)
             | "rotating"     // Partnership rotates each hole (Wolf)
             | "shot_pair";   // Alternate shot pairs (foursomes)

  // ── TEAM SIZE ──
  playersPerTeam?: number;    // default: derived from player count

  // ── ROTATION RULES (for "rotating") ──
  rotation?: {
    // How the rotating "captain" is determined
    order: "sequential" | "tee_order";  // sequential = hole number based
    // Can the captain go solo?
    allowLoneWolf: boolean;
    // When does the captain pick their partner?
    pickWindow: "after_first_drive" | "before_first_drive" | "after_all_drive";
  };

  // ── SHOT SELECTION (for "shot_pair") ──
  shotRule?: "alternate"      // Players alternate shots
           | "best_ball"      // Each player plays their own ball, best score counts
           | "scramble"       // Both play from best position
           | "shamble";       // Everyone tees off, best drive selected, then own ball

  // ── HANDICAP WITHIN TEAM ──
  // For team games: how is the team handicap/score derived?
  teamScoreMethod?: "best_ball"      // Lowest individual score on the team
                  | "combined"        // Sum of all team members' scores
                  | "low_ball_low_ball" // Nassau-style: compare low balls, then high balls
                  | "vegas_combined";  // Vegas: combine two scores into a 2-digit number
}
```

**Examples:**

2v2 Best Ball:
```json
{
  "structure": "fixed_teams",
  "playersPerTeam": 2,
  "teamScoreMethod": "best_ball"
}
```

Wolf:
```json
{
  "structure": "rotating",
  "rotation": {
    "order": "sequential",
    "allowLoneWolf": true,
    "pickWindow": "after_first_drive"
  }
}
```

Scramble:
```json
{
  "structure": "fixed_teams",
  "playersPerTeam": 2,
  "shotRule": "scramble"
}
```

---

## 4. PayoutConfig — how points convert to money

```typescript
interface PayoutConfig {
  // ── POINT VALUE ──
  pointValue: number;  // $ per point (0 = tracking only, no money)

  // ── PAYOUT STRUCTURE ──
  structure: "per_point"        // Each point worth $X (most common)
           | "per_hole"         // Each hole worth $X (skins, match play)
           | "nassau"           // Three bets: front 9, back 9, total
           | "pot_split";       // Winner(s) split accumulated pot

  // For "nassau" structure
  nassau?: {
    frontNine: number;     // $ value of front 9 bet
    backNine: number;      // $ value of back 9 bet
    total: number;         // $ value of overall bet
    presses?: boolean;     // Auto-press on going 2 down
    pressValue?: number;   // $ per press (default = base bet)
  };

  // For "per_hole" structure
  perHole?: {
    baseValue: number;     // $ per hole won
    carryoverOnTie?: boolean;
    carryoverMultiplier?: number;  // e.g., skins double after carryover
  };

  // ── SETTLEMENT METHOD ──
  // How final money is calculated
  settlement: "net_balance"   // Net all players, show who owes whom
            | "winner_pool";  // Winner takes all
}
```

**Examples:**

Standard ($5/point):
```json
{
  "pointValue": 5,
  "structure": "per_point",
  "settlement": "net_balance"
}
```

Skins ($10/hole):
```json
{
  "pointValue": 0,
  "structure": "per_hole",
  "perHole": { "baseValue": 10, "carryoverOnTie": true },
  "settlement": "winner_pool"
}
```

Nassau ($10 front, $10 back, $10 total):
```json
{
  "pointValue": 1,
  "structure": "nassau",
  "nassau": { "frontNine": 10, "backNine": 10, "total": 10, "presses": true, "pressValue": 10 },
  "settlement": "net_balance"
}
```

---

## 5. SideGameConfig — bonus bets (the "junk")

Side games are independent bonus bets that run alongside the main game.

```typescript
interface SideGameConfig {
  id: string;          // Unique identifier
  name: string;        // Display name
  type: "birdie_pool"  // $X per birdie
     | "sandies"       // $X for getting up-and-down from sand
     | "polies"        // $X for making a putt over N feet
     | "chippies"      // $X for chipping in
     | "snake"         // $X per 3-putt (paid to all others)
     | "longest_drive" // $X for longest drive on a hole
     | "closest_to_pin" // $X for closest to pin on par 3s
     | "trash"         // Collection: sandies + polies + chippies + greenies
     | "rabbit"        // First to win 2 holes in a row wins the rabbit
     | "omaha"         // 3-man: high score gets 2, low score gets 0, middle gets 1
     | "bingo_bango_bongo" // 3 points per hole: first on green, closest to pin, first in
     | "custom";       // User-defined trigger

  value: number;       // $ amount per occurrence
  perPlayer?: boolean; // If true, pays each other player (snake); if false, flat payout
  autoDetect?: boolean; // If true, system detects from scorecard; if false, manual entry
  applicableHoles?: "all" | "par3s" | "par4s" | "par5s";  // Restrict to certain holes
}
```

**Example:**
```json
[
  { "id": "birdie_pool", "name": "Birdie Pool", "type": "birdie_pool", "value": 10, "autoDetect": true },
  { "id": "snake", "name": "Snake", "type": "snake", "value": 2, "perPlayer": true, "autoDetect": true },
  { "id": "ctp1", "name": "Closest to Pin", "type": "closest_to_pin", "value": 5, "applicableHoles": "par3s" }
]
```

---

## 6. ModifierConfig — multipliers and special rules

```typescript
interface ModifierConfig {
  // ── PRESS / DOUBLE-OR-NOTHING ──
  press?: {
    enabled: boolean;
    maxPerHole: number;        // Max presses per hole (default: 3)
    multiplier: number;        // Each press doubles (2x, 4x, 8x)
    autoPress?: boolean;       // Auto-press when a team goes 2 down (Nassau-style)
    dropRule: "concede_base" | "no_drop";  // Drop = forfeit base points
  };

  // ── HAMMER ──
  hammer?: {
    enabled: boolean;
    multiplier: number;        // Default: 2x
    maxPerHole?: number;
    counterHammer?: boolean;   // Can opponent re-hammer back
  };

  // ── DOUBLE HOLES ──
  doubleHoles?: number[];      // Specific hole numbers worth 2x (e.g., [9, 18])
  doubleBack9?: boolean;       // Entire back 9 worth 2x

  // ── GAMMENS (Wolf variant) ──
  gammens?: {
    enabled: boolean;
    holeNumber: number;        // Which hole triggers double points
    affectsAll?: boolean;      // If true, doubles ALL bets on that hole
  };
}
```

**Example (Presses + Gammens):**
```json
{
  "press": {
    "enabled": true,
    "maxPerHole": 3,
    "multiplier": 2,
    "dropRule": "concede_base"
  },
  "gammens": {
    "enabled": true,
    "holeNumber": 17,
    "affectsAll": true
  }
}
```

---

## 7. HandicapConfig — how strokes are allocated

```typescript
interface HandicapConfig {
  enabled: boolean;
  percentage: number;          // How much of handicap applies (100%, 80%, etc.)
  method: "course_handicap"    // Standard: playing handicap × course rating
       | "difference"          // Difference from low handicapper
       | "callaway"            // Callaway system (post-round)
       | "peoria";             // Peoria system (quota-based)

  // For "difference" method
  lowBallZeroes?: boolean;     // If true, low handicapper plays scratch
  maxStrokes?: number;         // Cap maximum strokes received per hole
}
```

---

## Complete Example: "Wolf with Birdies, Presses, and $5/point"

```json
{
  "meta": {
    "name": "Tuesday Wolf + Birdies",
    "description": "4-player Wolf, $5/point, presses up to 3/hole, $10 birdie pool, Gammens on 17",
    "minPlayers": 4,
    "maxPlayers": 4,
    "createdBy": "ai"
  },
  "scoring": {
    "basis": "points",
    "winBy": "gross",
    "pointAllocation": {
      "type": "wolf_team",
      "loneWolfMultiplier": 2,
      "partnerPickTiming": "after_first_drive"
    },
    "lowerIsBetter": false,
    "tiesCarry": false
  },
  "teams": {
    "structure": "rotating",
    "rotation": {
      "order": "sequential",
      "allowLoneWolf": true,
      "pickWindow": "after_first_drive"
    }
  },
  "payouts": {
    "pointValue": 5,
    "structure": "per_point",
    "settlement": "net_balance"
  },
  "sideGames": [
    {
      "id": "birdie_pool",
      "name": "Birdie Pool",
      "type": "birdie_pool",
      "value": 10,
      "autoDetect": true
    }
  ],
  "modifiers": {
    "press": {
      "enabled": true,
      "maxPerHole": 3,
      "multiplier": 2,
      "dropRule": "concede_base"
    },
    "gammens": {
      "enabled": true,
      "holeNumber": 17,
      "affectsAll": true
    }
  },
  "handicaps": {
    "enabled": false
  }
}
```

---

## Complete Example: "Simple $20 Skins"

```json
{
  "meta": {
    "name": "$20 Skins",
    "description": "4-player skins, $20 per hole, carryover on ties",
    "minPlayers": 4,
    "maxPlayers": 4
  },
  "scoring": {
    "basis": "skins",
    "winBy": "gross",
    "pointAllocation": {
      "type": "skins_pot",
      "baseSkinValue": 1,
      "carryoverOnTie": true
    },
    "lowerIsBetter": false,
    "tiesCarry": true
  },
  "teams": {
    "structure": "solo"
  },
  "payouts": {
    "pointValue": 0,
    "structure": "per_hole",
    "perHole": { "baseValue": 20, "carryoverOnTie": true },
    "settlement": "winner_pool"
  }
}
```

---

## Engine Architecture

The config interpreter will be built as a new module: `client/src/lib/custom-game-engine.ts`

```
┌─────────────────────────────────────────────────────┐
│                  User Input                         │
│  "4-player Wolf, $5/point, presses, $10 birdies"   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              AI Config Parser                       │
│  (GLM model via z.ai, called from server)           │
│  Input: natural language                            │
│  Output: GameConfig JSON                            │
│  Validates against schema (Zod)                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              Config Interpreter                     │
│  (custom-game-engine.ts, client-side)               │
│  Reads GameConfig → produces scoring functions      │
│                                                     │
│  scoreHole(config, holeData) → HoleResult           │
│  getStandings(config, holeHistory) → Standings      │
│  getSettlement(config, standings) → Settlements[]   │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              Existing PinPlay UI                    │
│  Leaderboard, Scorecard, Settlement                 │
│  (unchanged — just receives data from engine)       │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Config is data, not code.** The AI generates a JSON config, never executable code. Safe, sandboxable, testable.

2. **Schema validated with Zod.** The same validation library already used in PinPlay's shared/schema.ts. Invalid configs are rejected before game start.

3. **Engine is stateless.** Given a config and hole history, it deterministically produces scores. No hidden state. Easy to test, easy to sync across WebSocket.

4. **Existing games become presets.** Each of the 23 existing game types gets a hardcoded GameConfig. The engine processes them identically to AI-generated configs. This proves the engine can handle everything.

5. **Fallback to manual entry.** If the AI parser fails or the config is ambiguous, show the user the closest preset and let them tweak parameters manually.

---

## AI Prompt Template

The AI parser will use this system prompt:

```
You are a golf game rules expert. Convert the user's description into a 
PinPlay GameConfig JSON.

Rules:
- Output ONLY valid JSON matching the GameConfig schema
- If the description is ambiguous, use sensible defaults
- All monetary values should be explicit (default pointValue: 0)
- Map unfamiliar terms to the closest supported mechanic
- If a described mechanic has no equivalent in the schema, omit it 
  and note it in the description field

Supported scoring bases: match, stroke, skins, points
Supported team structures: solo, fixed_teams, rotating, shot_pair
Supported side games: birdie_pool, sandies, polies, chippies, snake, 
  longest_drive, closest_to_pin, trash, rabbit, omaha, bingo_bango_bongo

Common golf slang translations:
- "nassau" → nassau payout structure
- "presses" or "pressing" → press modifier
- "hammer" → hammer modifier  
- "junk" or "trash" or "garbage" → trash side game
- "snake" or "3-putt game" → snake side game
- "dots" → any combination of side games
- "lone wolf" or "going solo" → allowLoneWolf: true
- "Gammens" or "double points on N" → gammens modifier
- "automatic 2-down press" → press.autoPress: true
- "wolf" → rotating team structure with wolf_team scoring
- "$5 a point" → pointValue: 5
- "$20 skins" → per_hole payout with baseValue: 20
```

---

## Implementation Phases

### Phase 1: Config Engine + Preset Migration (the big one)
- [ ] Build `custom-game-engine.ts` with config interpreter
- [ ] Convert all 23 existing game types to GameConfig presets
- [ ] Build `scoreHole()`, `getStandings()`, `getSettlement()` functions
- [ ] Wire engine output to existing UI components
- [ ] Test: every preset produces identical results to current game-logic.ts
- [ ] Add live settlement card to active game view
- [ ] Add points/$ toggle on leaderboard

### Phase 2: AI Natural Language Parser
- [ ] Server endpoint: POST /api/custom-game { description } → GameConfig
- [ ] Calls GLM model with the prompt template above
- [ ] Validates output with Zod schema
- [ ] Returns config to client
- [ ] UI: "Describe your game" text input → preview config → start game
- [ ] Fallback: show closest preset if AI output fails validation

### Phase 3: Polish
- [ ] Save custom configs for reuse ("My Games" library)
- [ ] Share custom game configs via link
- [ ] Config preview before game start (shows scoring rules in plain English)
- [ ] Validate edge cases: 2-player Wolf, 3-player scramble, etc.
