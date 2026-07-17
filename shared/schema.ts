import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, serial, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash"),
  handicapIndex: real("handicap_index"),
  ghinNumber: text("ghin_number"),
  homeCourse: text("home_course"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── OAuth accounts (Google, Apple, etc.) ──────────────────────────────────────

export const oauthAccounts = pgTable("oauth_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(), // "google" | "apple" | "email" | "phone"
  providerId: text("provider_id").notNull(), // Google sub, Apple user ID, etc.
  email: text("email"), // from OAuth response (nullable)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertOAuthAccountSchema = createInsertSchema(oauthAccounts).omit({
  id: true,
  createdAt: true,
});

export type InsertOAuthAccount = z.infer<typeof insertOAuthAccountSchema>;
export type OAuthAccount = typeof oauthAccounts.$inferSelect;

// ── OTP codes (phone verification) ───────────────────────────────────────────

export const otpCodes = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  contact: text("contact").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

// ── Favorites (quick-add players you play with often) ─────────────────────────

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  favoriteUserId: integer("favorite_user_id").notNull().references(() => users.id),
  favoriteName: text("favorite_name").notNull(), // denormalized for quick lookup
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertFavoriteSchema = createInsertSchema(favorites).omit({
  id: true,
  createdAt: true,
});

export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favorites.$inferSelect;

// ── Tournaments ──────────────────────────────────────────────────────────────

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: integer("creator_id").references(() => users.id),
  name: text("name").notNull(),
  date: timestamp("date").notNull(),
  courseName: text("course_name").notNull().default(""),
  courseId: text("course_id"),
  format: text("format").notNull().default("stroke_play"),
  maxPlayers: integer("max_players"),
  inviteCode: varchar("invite_code", { length: 8 }).unique().notNull(),
  status: text("status").notNull().default("open"),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertTournamentSchema = createInsertSchema(tournaments).omit({
  id: true,
  inviteCode: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournaments.$inferSelect;

// ── Tournament Teams (Phase 3: Teams and Groups) ─────────────────────────────

export const tournamentTeams = pgTable("tournament_teams", {
  id: serial("id").primaryKey(),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id),
  teamName: text("team_name").notNull(),
  teamColor: text("team_color").notNull().default("#4A90D9"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export type TournamentTeam = typeof tournamentTeams.$inferSelect;

// ── Tournament Players ───────────────────────────────────────────────────────

export const tournamentPlayers = pgTable("tournament_players", {
  id: serial("id").primaryKey(),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id),
  userId: integer("user_id").references(() => users.id),
  playerName: text("player_name").notNull(),
  isGuest: boolean("is_guest").notNull().default(false),
  status: text("status").notNull().default("registered"),
  teamId: integer("team_id"), // references tournament_teams.id (null for non-team tournaments)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertTournamentPlayerSchema = createInsertSchema(tournamentPlayers).omit({
  id: true,
  createdAt: true,
  isGuest: true,
  teamId: true,
});

export type InsertTournamentPlayer = z.infer<typeof insertTournamentPlayerSchema>;
export type TournamentPlayer = typeof tournamentPlayers.$inferSelect;

// ── Games ────────────────────────────────────────────────────────────────────

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: integer("user_id"),
  sessionId: text("session_id"),
  gameType: text("game_type").notNull().default("wolf"),
  players: jsonb("players").$type<string[]>().notNull(),
  teams: jsonb("teams").$type<string[][]>().notNull().default([]),
  handicaps: jsonb("handicaps").$type<Record<string, number>>().notNull().default({}),
  courseName: text("course_name").notNull().default(""),
  pars: jsonb("pars").$type<number[]>().notNull().default([]),
  strokeIndexes: jsonb("stroke_indexes").$type<number[]>().notNull().default([]),
  currentHole: integer("current_hole").notNull().default(1),
  currentWolfIndex: integer("current_wolf_index").notNull().default(0),
  tieCarryover: boolean("tie_carryover").notNull().default(false),
  scores: jsonb("scores").$type<Record<string, number[]>>().notNull().default({}),
  strokes: jsonb("strokes").$type<Record<string, number[]>>().notNull().default({}),
  totalScores: jsonb("total_scores").$type<Record<string, number>>().notNull().default({}),
  wolfCounts: jsonb("wolf_counts").$type<Record<string, number>>().notNull().default({}),
  holeHistory: jsonb("hole_history").$type<Array<{
    hole: number;
    strokes: Record<string, number>;
    points: Record<string, number>;
    result: string;
    metadata: Record<string, any>;
  }>>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  miniGames: jsonb("mini_games").$type<Record<string, { enabled: boolean; value: number }>>().notNull().default({}),
  gameSettings: jsonb("game_settings").$type<Record<string, any>>().notNull().default({}),
  gameConfig: jsonb("game_config").$type<Record<string, any>>().notNull().default({}),
  tournamentId: varchar("tournament_id").references(() => tournaments.id),
  tournamentRoundId: integer("tournament_round_id"), // references tournament_rounds.id (null for non-round games)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateGameSchema = insertGameSchema.partial();

export type InsertGame = z.infer<typeof insertGameSchema>;
export type UpdateGame = z.infer<typeof updateGameSchema>;
export type Game = typeof games.$inferSelect;

// ── Tournament Rounds (multi-day / multi-format) ──────────────────────────────

export const tournamentRounds = pgTable("tournament_rounds", {
  id: serial("id").primaryKey(),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id),
  roundNumber: integer("round_number").notNull().default(1),
  name: text("round_name"),              // e.g. "Day 1", "Rounds 1-2", "Final Round"
  format: text("format").notNull().default("stroke_play"), // stroke_play, stableford, match_play, skins, best_ball, scramble, ringer, net_ringer
  date: text("round_date"),              // ISO date string for this round
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertTournamentRoundSchema = createInsertSchema(tournamentRounds).omit({
  id: true,
  createdAt: true,
});

export type InsertTournamentRound = z.infer<typeof insertTournamentRoundSchema>;
export type TournamentRound = typeof tournamentRounds.$inferSelect;

// ── Game Templates ───────────────────────────────────────────────────────────

export const gameTemplates = pgTable("game_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),             // user-given name, e.g. "Tuesday Wolf"
  gameType: text("game_type").notNull(),    // wolf, nassau, match_play, stableford, ...
  playerCount: integer("player_count").notNull().default(4),
  defaultHandicaps: jsonb("default_handicaps").$type<Record<string, number>>().notNull().default({}),
  defaultMiniGames: jsonb("default_mini_games").$type<Record<string, { enabled: boolean; value: number }>>().notNull().default({}),
  defaultGameSettings: jsonb("default_game_settings").$type<Record<string, any>>().notNull().default({}),
  gameConfig: jsonb("game_config").$type<Record<string, any>>().notNull().default({}),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  shareCode: varchar("share_code", { length: 8 }).unique(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertGameTemplateSchema = createInsertSchema(gameTemplates).omit({
  id: true,
  createdAt: true,
});

export type InsertGameTemplate = z.infer<typeof insertGameTemplateSchema>;
export type GameTemplate = typeof gameTemplates.$inferSelect;

// ── Tournament Matches (Phase 5.2: Ryder Cup & match pairings) ────────────────

export const tournamentMatches = pgTable("tournament_matches", {
  id: serial("id").primaryKey(),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id),
  roundId: integer("round_id"), // references tournament_rounds.id
  session: text("session").notNull().default("singles"), // fourball_am, fourball_pm, foursome, singles
  matchType: text("match_type").notNull().default("singles"), // singles, fourball, foursome
  team1Players: jsonb("team1_players").$type<string[]>().notNull().default([]),
  team2Players: jsonb("team2_players").$type<string[]>().notNull().default([]),
  gameId: varchar("game_id"), // linked game if any
  result: jsonb("result").$type<{
    team1HolesUp: number;
    team2HolesUp: number;
    status: string; // pending, in_progress, complete
    holesPlayed: number;
    winner: string | null; // "team1", "team2", "halved"
  }>().notNull().default({ team1HolesUp: 0, team2HolesUp: 0, status: "pending", holesPlayed: 0, winner: null }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertTournamentMatchSchema = createInsertSchema(tournamentMatches).omit({
  id: true,
  createdAt: true,
});

export type InsertTournamentMatch = z.infer<typeof insertTournamentMatchSchema>;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;

// ── Side Bets (Phase 5.3: Player-to-player with approval) ──────────────────────

export const sideBets = pgTable("side_bets", {
  id: serial("id").primaryKey(),
  tournamentId: varchar("tournament_id"), // nullable for game-only side bets
  gameId: varchar("game_id"), // linked game for hole/round-scoped bets
  proposerId: integer("proposer_id"), // references tournament_players.id (null for regular games)
  proposerName: text("proposer_name").notNull(),
  targetIds: jsonb("target_ids").$type<number[]>().notNull().default([]), // tournament_players.id array
  targetNames: jsonb("target_names").$type<string[]>().notNull().default([]), // player names for regular game side bets
  amount: real("amount").notNull().default(0),
  betType: text("bet_type").notNull().default("custom"), // closest_to_pin, longest_drive, most_birdies, low_net, low_gross, custom
  scope: text("scope").notNull().default("round"), // hole, round, tournament
  holeNumber: integer("hole_number"), // for hole-scoped bets
  description: text("description"),
  status: text("status").notNull().default("pending"), // pending, accepted, declined, completed
  result: jsonb("result").$type<{
    winnerId: number | null;
    winnerName: string | null;
    settledAt: string | null;
  }>().notNull().default({ winnerId: null, winnerName: null, settledAt: null }),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertSideBetSchema = createInsertSchema(sideBets).omit({
  id: true,
  createdAt: true,
});

export type InsertSideBet = z.infer<typeof insertSideBetSchema>;
export type SideBet = typeof sideBets.$inferSelect;

// ── Input sanitization ────────────────────────────────────────────────────────

/** Sanitize a player name: trim, collapse whitespace, strip HTML/control chars, enforce length. */
export function sanitizePlayerName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name
    .trim()
    .replace(/[\x00-\x1F\x7F<>]/g, "") // strip control chars + angle brackets
    .replace(/\s+/g, " ")              // collapse whitespace
    .slice(0, 50);                      // max 50 chars
}

/** Validate an array of player names: 2+ players (no upper cap — tournament mode supports 20+), each 1-50 chars after sanitization. */
export function validatePlayers(players: unknown): string[] {
  if (!Array.isArray(players)) throw new Error("Players must be an array");
  if (players.length < 2) throw new Error("Must have at least 2 players");
  const sanitized = players.map((p: any) => sanitizePlayerName(p));
  if (sanitized.some(p => p.length < 1)) throw new Error("Player names cannot be empty");
  return sanitized;
}

// ── Invite code generation ────────────────────────────────────────────────────

const INVITE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += INVITE_CHARSET[Math.floor(Math.random() * INVITE_CHARSET.length)];
  }
  return code;
}

// ── WebSocket messages ────────────────────────────────────────────────────────

export const wsMessageSchema = z.union([
  z.object({ type: z.literal("join_game"), gameId: z.string() }),
  z.object({
    type: z.literal("update_strokes"),
    gameId: z.string(),
    playerName: z.string(),
    hole: z.number(),
    strokes: z.number(),
  }),
  z.object({
    type: z.literal("complete_hole"),
    gameId: z.string(),
    holeData: z.object({
      hole: z.number(),
      strokes: z.record(z.string(), z.number()),
      points: z.record(z.string(), z.number()),
      result: z.string(),
      metadata: z.record(z.string(), z.any()),
    }),
  }),
  z.object({
    type: z.literal("edit_hole"),
    gameId: z.string(),
    holeNumber: z.number().int().min(1).max(18),
    newStrokes: z.record(z.string(), z.number()),
  }),
  z.object({ type: z.literal("ping") }),
  z.object({ type: z.literal("pong") }),
  z.object({ type: z.literal("game_updated"), game: z.any() }),
  // Tournament WebSocket messages
  z.object({ type: z.literal("join_tournament"), tournamentId: z.string() }),
  z.object({ type: z.literal("leave_tournament"), tournamentId: z.string() }),
  z.object({ type: z.literal("tournament_updated"), tournament: z.any() }),
  z.object({ type: z.literal("tournament_match_update"), tournamentId: z.string(), matchId: z.number() }),
  z.object({ type: z.literal("side_bet_update"), tournamentId: z.string(), sideBetId: z.number() }),
  z.object({
    type: z.literal("tournament_score_update"),
    tournamentId: z.string(),
    playerId: z.string(),
    playerName: z.string(),
    hole: z.number(),
    totalStrokes: z.number(),
  }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;

// ── Tournament leaderboard types ─────────────────────────────────────────────

export interface LeaderboardEntry {
  position: number;
  playerName: string;
  userId: number | null;
  avatarUrl?: string | null;
  totalStrokes: number;
  netStrokes: number;
  handicap: number;
  holesCompleted: number;
  complete: boolean;
  gameId: string | null;
  // ── Format-specific optional fields ──
  skinsWon?: number;       // Skins format: number of skins won
  teamName?: string;        // Team formats: display name (e.g. "Team 1")
  teamPlayers?: string[];   // Team formats: member names
  format?: string;          // Which tournament format produced this entry
  // Stableford
  stablefordPoints?: number;  // Total stableford points
  quota?: number;             // Quota target (36 - handicap)
  // Match Play
  matchStatus?: string;       // "W", "L", "H", "AS", "2UP", "3&2" etc.
  matchHolesUp?: number;      // Holes up (negative = down)
  // Multi-day (Phase 5.1)
  roundScores?: Record<string, number>; // roundId (as string) -> score for that round
  totalThroughRounds?: number;          // cumulative total across all rounds
  thruRound?: number;                   // which round number the player is currently in
  // Enhanced live scoring (Phase 5.4)
  previousPosition?: number;            // position before latest update (for movement arrows)
  birdieStreak?: number;               // consecutive holes under par (for "on fire" indicator)
}
