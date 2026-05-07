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

/** Validate an array of player names: 2-4 players, each 1-50 chars after sanitization. */
export function validatePlayers(players: unknown): string[] {
  if (!Array.isArray(players)) throw new Error("Players must be an array");
  if (players.length < 2 || players.length > 4) throw new Error("Must have 2-4 players");
  const sanitized = players.map((p: any) => sanitizePlayerName(p));
  if (sanitized.some(p => p.length < 1)) throw new Error("Player names cannot be empty");
  return sanitized;
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
  z.object({ type: z.literal("game_updated"), game: z.any() }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;
