# PinPlay — Flexible Game Config Design

Status: Phase 1 COMPLETE — schema, scoring engine, and GHIN scaffolding built and verified (43/43 tests pass)
Last updated: 2026-07-17

## What we're building

A flexible game-config system that lets PinPlay handle ANY golf format — from a casual 2-player match to a 4-day, 20-player tournament with multiple bet pools, rotating partners, and custom scoring rules — without hardcoding every format as a separate game type.

Two entry paths into the same config:
1. **Presets** (dropdowns) — fast path, covers the common formats that already exist
2. **Custom Game** (LLM-powered) — describe your format in plain language, app parses it into a valid config

The config is frozen once the round/tournament starts. Side bets can still be added mid-round (they slot into the bet pool system, not the game config).

---

## UX Flow

### Top-level entry

```
[New Game]
    │
    ├── Regular Round ──── single day, one game format
    │
    └── Tournament ─────── multi-day event, per-day formats, teams
```

### Regular Round flow

```
Step 1: Player Count
  2 / 3 / 4 / 5  (current dropdowns stay as-is)

Step 2: Game Type
  ┌─────────────────────────────────────────┐
  │  Preset games (filtered by player count) │   ← current GAME_DEFINITIONS dropdowns
  │  Match Play · Wolf · Skins · Scramble... │
  ├─────────────────────────────────────────┤
  │  ✨ Create Custom Game                   │   ← NEW: LLM natural-language entry
  └─────────────────────────────────────────┘

Step 3: Players + Handicaps (same as today)

Step 4: Mini-Games / Side Bets (same as today)

Step 5: Course + Pars (same as today)

→ Round starts, config frozen
```

### Tournament flow

```
Step 1: Event Setup
  ├── Number of days: 1 / 2 / 3 / 4
  ├── Number of players: up to 20+
  └── Team structure (optional):
      ├── Individual (no teams)
      ├── Pre-set teams (assign players to teams)
      └── Generated (system creates teams)

Step 2: Per-Day Configuration (for each day)
  ┌──────────────────────────────────────────┐
  │  Day 1:                                  │
  │    ┌──────────────┐  ┌────────────────┐ │
  │    │ Preset ▼     │  │ Custom Game    │ │
  │    │ (Scramble)   │  │                │ │
  │    └──────────────┘  └────────────────┘ │
  │                                          │
  │  Day 2:                                  │
  │    ┌──────────────┐  ┌────────────────┐ │
  │    │ Preset ▼     │  │ Custom Game    │ │
  │    │ (Best Ball)  │  │                │ │
  │    └──────────────┘  └────────────────┘ │
  │                                          │
  │  Day 3: ...                              │
  └──────────────────────────────────────────┘

  Each day can be a different preset OR custom game.
  Some days might be "rest day" or "practice round" (no scoring).

Step 3: Tournament-Wide Pools
  ├── Team Match Play ($X per match)
  ├── Individual Skins ($Y per hole)
  ├── Closest to Pin / Longest Drive
  ├── Custom bet pool (LLM or manual)
  └── Each pool runs across ALL days

Step 4: Players + Teams + Handicaps

Step 5: Course(s) — same course each day or different course per day

→ Tournament starts, config frozen
```

---

## Config Schema

### Core principle

Every game — preset or custom — produces the same JSON shape. The scoring engine reads this config and knows exactly what to do. Presets are just pre-built configs; the LLM generates configs in the same shape.

### GameConfig (per day / per round)

```typescript
interface GameConfig {
  // ── Identity ──
  id: string;                          // "custom_xxx" or preset id
  name: string;                        // display name
  source: "preset" | "custom";         // how it was created
  description?: string;                // human-readable summary

  // ── Players & Teams ──
  playerCount: number;                 // total players
  teamStructure: TeamStructure;

  // ── Scoring ──
  scoring: ScoringRules;

  // ── Bet Pools ──
  betPools: BetPool[];

  // ── Press Rules ──
  pressRules?: PressRules;

  // ── Mini-Games (auto-tracked) ──
  miniGames: MiniGameConfig[];

  // ── Side Bets (1-on-1 personal wagers) ──
  sideBets: SideBetConfig[];

  // ── Metadata ──
  needsHandicap: boolean;
  carryover: boolean;
  specialInputs?: string[];            // e.g. ["bingo", "bango", "bongo"]
}
```

### TeamStructure

```typescript
interface TeamStructure {
  type: "individual" | "teams";

  // For teams:
  teams?: TeamDef[];
  assignmentMode?: "preset" | "rotating" | "wolf_style";
  // preset = teams set at start
  // rotating = partners rotate (e.g. Sixes splits into 3 segments)
  // wolf_style = one player picks partner each hole

  // For rotating/wolf:
  rotationRules?: RotationRules;
}

interface TeamDef {
  id: string;        // "A", "B", "C"...
  name: string;      // "Team Alpha"
  playerIds: string[];
}

interface RotationRules {
  method: "segments" | "per_hole" | "wolf_pick";
  segments?: number;          // for segments (e.g. 3 segments of 6 holes)
  wolfOrder?: "last" | "first";  // wolf rotation order
}
```

### ScoringRules (the heart of the system)

```typescript
interface ScoringRules {
  // How scores are compared
  format: ScoringFormat;
  // stroke_play | match_play | skins | points | stableford | quota

  // What counts per hole (for team games)
  countingScores?: CountingScoreDef[];
  // e.g. "2 best gross + 1 best net" = [
  //   { type: "gross", count: 2, order: "low" },
  //   { type: "net",  count: 1, order: "low" }
  // ]

  // For points-based formats
  pointsTable?: Record<string, number>;
  // e.g. { eagle: 4, birdie: 2, par: 1, bogey: 0 }

  // For stableford
  stablefordTable?: Record<string, number>;
  // e.g. { "2": 5, "1": 4, "0": 3, "+1": 2, "+2": 1 }  (relative to par)

  // Carryover behavior
  carryover: boolean;
  carryoverType?: "skins" | "nassau";  // how carries accumulate

  // Handicap application
  handicapBased: boolean;
  handicapMethod?: "full" | "match_play_diff" | "peoria" | "callaway";

  // Per-hole value (if fixed)
  holeValue?: number;        // e.g. $5 per hole
  holeValueUnit?: "points" | "dollars";

  // Multi-segment (Nassau-style)
  segments?: ScoringSegment[];
  // e.g. Nassau = front 9, back 9, overall
}

interface CountingScoreDef {
  type: "gross" | "net";
  count: number;       // how many scores to count
  order: "low" | "high";  // low = best score, high = worst
}

interface ScoringSegment {
  name: string;        // "Front 9", "Back 9", "Overall"
  holes: [number, number];  // [1, 9], [10, 18], [1, 18]
  value?: number;      // bet value for this segment
}

type ScoringFormat =
  | "stroke_play"      // total strokes, lowest wins
  | "match_play"       // hole-by-hole win/loss/halve
  | "skins"            // low score wins outright, ties carry
  | "points"           // custom point system per hole
  | "stableford"       // points relative to par
  | "quota"            // target points, play to reach/exceed
  | "nine_point"       // fixed points split by finish position
  | "bingo_bango_bongo" // 3 special achievements per hole
  | "custom";          // fully custom (LLM defines per-hole logic)
```

### BetPool (money that flows through the game)

```typescript
interface BetPool {
  id: string;
  name: string;                    // "Team Match", "Skins", "Closest to Pin"
  type: BetPoolType;
  scope: "per_hole" | "per_round" | "per_day" | "per_tournament";
  participants: "all" | "teams" | "individuals" | string[];  // player/team IDs
  value: number;                   // dollar amount per unit
  valueUnit: "per_hole" | "per_round" | "per_point" | "flat";

  // Optional qualifiers
  qualifier?: string;              // e.g. "par 3s only", "birdies only"
}

type BetPoolType =
  | "match"            // head-to-head or team-vs-team
  | "skins"            // low score wins, carries on ties
  | "pool"             // everyone contributes, winner takes
  | "achievement"      // closest to pin, longest drive, etc.
  | "side_bet"         // personal 1-on-1 wager
  | "custom";
```

### PressRules

```typescript
interface PressRules {
  enabled: boolean;
  maxPerHole: number;         // 3 default
  multiplier: number[];       // [2, 4, 8] = 2x, 4x, 8x
  whoCanPress: "anyone" | "losing_only";
  responseType: "accept_or_drop";  // drop = concede base points
  crossGroup?: boolean;       // can press between teams/groups in tournament
}
```

### MiniGameConfig & SideBetConfig

```typescript
// Auto-tracked for all players (birdies, sandies, etc.)
interface MiniGameConfig {
  id: string;                  // "birdie_pool"
  enabled: boolean;
  value: number;               // dollar amount
}

// 1-on-1 personal wagers between specific players
interface SideBetConfig {
  id: string;
  playerA: string;
  playerB: string;
  description: string;         // "$20 on lowest round"
  scope: "hole" | "round" | "game";
  value: number;
}
```

### TournamentConfig (wraps multiple GameConfigs)

```typescript
interface TournamentConfig {
  id: string;
  name: string;
  totalDays: number;
  players: Player[];

  teams?: TeamDef[];                    // tournament-level teams

  // Per-day game configs
  days: TournamentDay[];

  // Tournament-wide bet pools (span all days)
  tournamentPools: BetPool[];

  // Aggregate leaderboard rules
  leaderboard: LeaderboardConfig;
}

interface TournamentDay {
  dayNumber: number;
  date?: string;
  course?: CourseRef;
  gameConfig: GameConfig;               // can be preset or custom per day
  status: "upcoming" | "in_progress" | "complete" | "rest_day";
}

interface LeaderboardConfig {
  aggregation: "total_strokes" | "total_points" | "match_record" | "custom";
  countingMethod?: CountingScoreDef[];  // e.g. "2 best gross + 1 best net" across days
  tiesResolvedBy?: "playoff" | "countback" | "split";
}
```

---

## Preset → Config Mapping

Every existing GAME_DEFINITIONS entry maps to a GameConfig. Examples:

**Match Play** →
```
{ scoring: { format: "match_play", holeValue: 1, carryover: false, handicapBased: true } }
```

**Skins** →
```
{ scoring: { format: "skins", carryover: true } }
{ betPools: [{ type: "skins", scope: "per_hole", value: 5 }] }
```

**Nassau** →
```
{ scoring: { format: "match_play", segments: [
    { name: "Front 9", holes: [1,9] },
    { name: "Back 9", holes: [10,18] },
    { name: "Overall", holes: [1,18] }
]}}
```

**Scramble (2v2)** →
```
{ teamStructure: { type: "teams", teams: [A,B] } }
{ scoring: { format: "stroke_play", countingScores: [{ type: "gross", count: 1, order: "low" }] }}
{ scoring: { format: "stroke_play", countingScores: [{ type: "gross", count: 1, order: "low" }] }}
```

**Wolf (3-player)** →
```
{ teamStructure: { type: "teams", assignmentMode: "wolf_style",
    rotationRules: { method: "wolf_pick", wolfOrder: "last" } }}
{ scoring: { format: "match_play" }}
```

**9-Point** →
```
{ scoring: { format: "nine_point" }}
```

**Custom: "2 best gross + 1 best net, $20 team match, $2 skins no strokes"** →
```
{ teamStructure: { type: "teams", teams: [A,B,C] }}
{ scoring: { format: "match_play", countingScores: [
    { type: "gross", count: 2, order: "low" },
    { type: "net",  count: 1, order: "low" }
]}}
{ betPools: [
    { type: "match", scope: "per_round", value: 20 },
    { type: "skins", scope: "per_hole", value: 2, qualifier: "no_strokes" }
]}
```

---

## LLM Custom Game Parser

### Flow

```
User types/speaks:
  "3 teams of 5, 2 best gross and 1 best net per hole,
   $20 team match play, individual par-3 closest to pin for $10,
   skins with no strokes at $2 a hole plus $2 per birdie"

         │
         ▼

  ┌──────────────────────────────┐
  │  Backend API endpoint         │
  │  POST /api/game-config/parse  │
  │                               │
  │  Calls GLM with:              │
  │  - System prompt (schema)     │
  │  - User's natural language    │
  │  - Returns GameConfig JSON    │
  └──────────────┬───────────────┘
                 │
                 ▼

  ┌──────────────────────────────┐
  │  Config Validator             │
  │  - Checks all required fields │
  │  - Validates player counts    │
  │  - Validates bet pool logic   │
  │  - Returns errors if invalid  │
  └──────────────┬───────────────┘
                 │
                 ▼

  ┌──────────────────────────────┐
  │  Preview Screen               │
  │  Shows parsed config in       │
  │  human-readable form + allows │
  │  manual tweaks before start   │
  └──────────────┬───────────────┘
                 │
                 ▼

  Config locked → game starts
```

### GLM prompt design

System prompt gives GLM:
1. The full GameConfig schema (TypeScript interfaces above)
2. 10-15 example natural-language → config mappings (few-shot)
3. Golf terminology glossary (skins, nassau, press, shamble, etc.)
4. Strict instruction: output ONLY valid JSON, no explanation

The few-shot examples are critical for first-try accuracy. They teach GLM how common phrases map to config fields.

### No LLM during live scoring

The LLM runs ONCE at setup time. After that, the config is frozen and the scoring engine (pure TypeScript, deterministic) handles everything. This keeps live scoring fast and reliable.

---

## Scoring Engine (executes any valid config)

The current `game-logic.ts` uses a giant switch statement on `gameType` string. The new engine replaces this with a config-driven approach:

```typescript
// Instead of:
switch (gameType) {
  case "match_play": ...
  case "skins": ...
}

// New approach:
function scoreHole(config: GameConfig, holeData: HoleData): HoleResult {
  // 1. Apply handicap strokes if config.scoring.handicapBased
  // 2. Compute counting scores per config.scoring.countingScores
  // 3. Compare per config.scoring.format
  // 4. Update bet pools per config.betPools
  // 5. Handle press per config.pressRules
  // 6. Return structured result
}
```

Existing presets still work because they produce GameConfig objects. The switch statement gets replaced incrementally — each preset's logic moves into a config-driven function.

---

## Implementation Phases

### Phase 1: Schema + Preset Migration (foundation)
- Define all TypeScript interfaces
- Write config validator
- Map all existing GAME_DEFINITIONS to GameConfig objects
- Build scoring engine that handles all current formats via config
- Verify: every existing game type produces identical results through the new engine
- No UI changes yet — pure backend refactor

### Phase 2: Player Expansion
- Remove the 4-player UI cap, support up to 20+ players
- Team setup UI for tournaments (assign players to teams)
- Tournament day-by-day config UI
- Verify: regular rounds work exactly as before, tournaments work for 15+ players

### Phase 3: Custom Game (LLM)
- Backend endpoint `/api/game-config/parse`
- GLM integration with few-shot prompt
- Config preview screen with manual edit capability
- "Create Custom Game" button on setup screen
- Tournament: custom game per day
- Verify: common natural-language descriptions parse correctly

### Phase 4: Advanced Tournament Features
- Cross-group pressing
- Tournament-wide aggregate leaderboard
- Multi-pool simultaneous settlement
- Per-day different course support

---

## Open Questions — RESOLVED 2026-07-17

1. **Max player count for regular rounds?** → Any number allowed. If over 5, prompt user to consider group/tournament mode (but don't force it). IMPLEMENTED: player count selection now includes "6+ Players" option with a modal prompt.
2. **Handicap sources for large tournaments?** → GHIN lookup per player when possible, with manual entry as fallback. GHIN requires USGA Authorized Handicap Data Affiliate status — user applying separately. SCAFFOLDED: GhinService interface and stub at `server/ghin-service.ts`, `ghinNumber` field added to users table.
3. **Config sharing?** → Yes. Users can save and share custom game configs. SCAFFOLDED: `isPublic` and `shareCode` fields added to gameTemplates table, `gameConfig` jsonb column added.
4. **Offline handling?** → Local-first/offline mode needed for tournament tracking when cell service is lost. DEFERRED to Phase 4 — requires client-side persistence layer (IndexedDB or SQLite WASM).

## GHIN Integration Notes

**Status:** Scaffolding only — awaiting USGA Authorized Handicap Data Affiliate approval.

**API Reference (from SportsFirst documentation):**
- Base URL: `https://api.ghin.com/api/v1`
- Auth: OAuth 2.0 Client Credentials flow
- `GET /golfers/{ghin}/handicap` — returns official Handicap Index, last revision date, trend
- `GET /golfers/{ghin}/scores` — score history
- `POST /scores` — post a new score (9/18 hole, home/away, tournament)
- Course Handicap formula: `Math.round(handicapIndex * (slopeRating / 113))`

**Architecture:**
- `shared/game-config.ts` — `GhinServiceInterface`, `GhinHandicapResult`, `GhinScoreEntry` types
- `server/ghin-service.ts` — `GhinService` class with all methods stubbed; `GhinService.computeCourseHandicap()` static method is fully implemented (pure math, no API needed)
- `shared/schema.ts` — `ghinNumber` field on `users` table

**Activation steps:**
1. Complete USGA Affiliate application (user handling separately)
2. Set `GHIN_CLIENT_ID` and `GHIN_CLIENT_SECRET` environment variables
3. Uncomment fetch calls in `server/ghin-service.ts`
4. Wire `GhinService.lookupHandicap()` into handicap entry UI (replace manual-only flow)

**Compliance requirements:**
- Backend-only GHIN calls (never expose credentials in frontend)
- Token refresh and retry logic
- Rate-limit aware backoff
- User consent for data access
- Audit logs for tournament disputes
