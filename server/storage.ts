import { eq, desc, and, or, ilike, sql as sqlOp } from "drizzle-orm";
import { db, pool } from "./db";
import { games, users, otpCodes, oauthAccounts, favorites } from "@shared/schema";
import type { Game, InsertGame, UpdateGame, User, InsertUser, OAuthAccount, Favorite } from "@shared/schema";
import { randomUUID } from "crypto";
import session from "express-session";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";

const PostgresSessionStore = connectPg(session);
const MemoryStore = createMemoryStore(session);

// ── Storage interface ─────────────────────────────────────────────────────────

export interface IStorage {
  // Games
  getGame(id: string): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, updates: UpdateGame): Promise<Game | undefined>;
  deleteGame(id: string): Promise<boolean>;
  getGamesByUser(userId: number): Promise<Game[]>;

  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;

  // OTP
  createOtp(contact: string, code: string, expiresAt: Date): Promise<void>;
  verifyOtp(contact: string, code: string): Promise<boolean>;

  // OAuth
  getOAuthAccount(provider: string, providerId: string): Promise<OAuthAccount | undefined>;
  createOAuthAccount(userId: number, provider: string, providerId: string, email?: string | null): Promise<OAuthAccount>;
  linkOAuthAccount(userId: number, provider: string, providerId: string, email?: string | null): Promise<OAuthAccount | undefined>;

  // Favorites
  getFavorites(userId: number): Promise<(Favorite & { avatarUrl: string | null; handicapIndex: number | null })[]>;
  addFavorite(userId: number, favoriteUserId: number, favoriteName: string): Promise<Favorite>;
  removeFavorite(userId: number, favoriteUserId: number): Promise<boolean>;
  searchUsers(query: string, excludeUserId: number): Promise<User[]>;

  // Session store
  sessionStore: session.Store;
}

// ── DatabaseStorage ───────────────────────────────────────────────────────────

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  // Games ──────────────────────────────────────────────────────────────────────

  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game;
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const players = insertGame.players as string[];
    const scores: Record<string, number[]> = {};
    const strokes: Record<string, number[]> = {};
    const totalScores: Record<string, number> = {};
    const wolfCounts: Record<string, number> = {};
    players.forEach(p => {
      scores[p] = [];
      strokes[p] = [];
      totalScores[p] = 0;
      wolfCounts[p] = 0;
    });

    const defaultPars = Array(18).fill(4);

    const [game] = await db.insert(games).values({
      id: randomUUID(),
      gameType: insertGame.gameType ?? "wolf",
      userId: insertGame.userId ?? null,
      players,
      teams: (insertGame.teams as string[][] | undefined) ?? [],
      handicaps: (insertGame.handicaps as Record<string, number> | undefined) ?? {},
      courseName: insertGame.courseName ?? "",
      pars: (insertGame.pars && insertGame.pars.length === 18) ? insertGame.pars as number[] : defaultPars,
      strokeIndexes: (insertGame.strokeIndexes && (insertGame.strokeIndexes as number[]).length === 18)
        ? insertGame.strokeIndexes as number[]
        : Array.from({ length: 18 }, (_, i) => i + 1),
      currentHole: 1,
      currentWolfIndex: 0,
      tieCarryover: insertGame.tieCarryover ?? false,
      scores,
      strokes,
      totalScores,
      wolfCounts,
      holeHistory: [],
      active: true,
    }).returning();

    return game;
  }

  async updateGame(id: string, updates: UpdateGame): Promise<Game | undefined> {
    const [game] = await db
      .update(games)
      .set({ ...(updates as any), updatedAt: new Date() })
      .where(eq(games.id, id))
      .returning();
    return game;
  }

  async deleteGame(id: string): Promise<boolean> {
    const result = await db.delete(games).where(eq(games.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getGamesByUser(userId: number): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(eq(games.userId, userId))
      .orderBy(desc(games.createdAt));
  }

  // Users ──────────────────────────────────────────────────────────────────────

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // OTP ────────────────────────────────────────────────────────────────────────

  async createOtp(contact: string, code: string, expiresAt: Date): Promise<void> {
    await db.insert(otpCodes).values({ contact, code, expiresAt });
  }

  async verifyOtp(contact: string, code: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.contact, contact))
      .orderBy(desc(otpCodes.createdAt));

    if (!row) return false;
    if (row.used) return false;
    if (row.code !== code) return false;
    if (new Date() > row.expiresAt) return false;

    await db.update(otpCodes).set({ used: true }).where(eq(otpCodes.id, row.id));
    return true;
  }

  // OAuth ─────────────────────────────────────────────────────────────────────

  async getOAuthAccount(provider: string, providerId: string): Promise<OAuthAccount | undefined> {
    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerId, providerId)));
    return account;
  }

  async createOAuthAccount(userId: number, provider: string, providerId: string, email?: string | null): Promise<OAuthAccount> {
    const [account] = await db
      .insert(oauthAccounts)
      .values({ userId, provider, providerId, email: email ?? null })
      .returning();
    return account;
  }

  async linkOAuthAccount(userId: number, provider: string, providerId: string, email?: string | null): Promise<OAuthAccount | undefined> {
    // Check if already linked
    const existing = await this.getOAuthAccount(provider, providerId);
    if (existing) return existing;
    return this.createOAuthAccount(userId, provider, providerId, email);
  }

  // Favorites ─────────────────────────────────────────────────────────────────

  async getFavorites(userId: number): Promise<(Favorite & { avatarUrl: string | null; handicapIndex: number | null })[]> {
    const rows = await db
      .select({
        id: favorites.id,
        userId: favorites.userId,
        favoriteUserId: favorites.favoriteUserId,
        favoriteName: favorites.favoriteName,
        createdAt: favorites.createdAt,
        avatarUrl: users.avatarUrl,
        handicapIndex: users.handicapIndex,
      })
      .from(favorites)
      .innerJoin(users, eq(favorites.favoriteUserId, users.id))
      .where(eq(favorites.userId, userId))
      .orderBy(favorites.favoriteName);
    return rows;
  }

  async addFavorite(userId: number, favoriteUserId: number, favoriteName: string): Promise<Favorite> {
    // Upsert — ignore if already exists
    const [fav] = await db
      .insert(favorites)
      .values({ userId, favoriteUserId, favoriteName })
      .onConflictDoNothing()
      .returning();
    if (fav) return fav;
    // Already exists — fetch it
    const [existing] = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.favoriteUserId, favoriteUserId)));
    return existing!;
  }

  async removeFavorite(userId: number, favoriteUserId: number): Promise<boolean> {
    const result = await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.favoriteUserId, favoriteUserId)));
    return (result.rowCount ?? 0) > 0;
  }

  async searchUsers(query: string, excludeUserId: number): Promise<User[]> {
    const pattern = `%${query}%`;
    return db
      .select()
      .from(users)
      .where(
        and(
          or(
            ilike(users.name, pattern),
            ilike(users.email, pattern),
          ),
          sqlOp`${users.id} != ${excludeUserId}`
        )
      )
      .limit(10);
  }
}

// ── Fallback in-memory (games only, no user persistence) ─────────────────────

export class MemStorage implements IStorage {
  private gameMap: Map<string, Game> = new Map();
  private userMap: Map<number, User> = new Map();
  private nextUserId = 1;
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });
  }

  async getGame(id: string) { return this.gameMap.get(id); }
  async getGamesByUser(userId: number) {
    return [...this.gameMap.values()].filter(g => g.userId === userId);
  }
  async createGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const now = new Date();
    const players = insertGame.players as string[];
    const scores: Record<string, number[]> = {};
    const strokes: Record<string, number[]> = {};
    const totalScores: Record<string, number> = {};
    const wolfCounts: Record<string, number> = {};
    players.forEach(p => { scores[p] = []; strokes[p] = []; totalScores[p] = 0; wolfCounts[p] = 0; });
    const game: Game = {
      id, userId: insertGame.userId ?? null,
      gameType: insertGame.gameType ?? "wolf", players,
      teams: (insertGame.teams as string[][] | undefined) ?? [],
      handicaps: (insertGame.handicaps as Record<string, number> | undefined) ?? {},
      courseName: insertGame.courseName ?? "",
      pars: (insertGame.pars && insertGame.pars.length === 18) ? insertGame.pars as number[] : Array(18).fill(4),
      strokeIndexes: (insertGame.strokeIndexes && (insertGame.strokeIndexes as number[]).length === 18)
        ? insertGame.strokeIndexes as number[] : Array.from({ length: 18 }, (_, i) => i + 1),
      currentHole: 1, currentWolfIndex: 0,
      tieCarryover: insertGame.tieCarryover ?? false,
      scores, strokes, totalScores, wolfCounts, holeHistory: [], active: true,
      createdAt: now, updatedAt: now,
    };
    this.gameMap.set(id, game);
    return game;
  }
  async updateGame(id: string, updates: UpdateGame) {
    const g = this.gameMap.get(id);
    if (!g) return undefined;
    const updated = { ...g, ...(updates as Partial<Game>), updatedAt: new Date() };
    this.gameMap.set(id, updated);
    return updated;
  }
  async deleteGame(id: string) { return this.gameMap.delete(id); }

  async getUser(id: number) { return this.userMap.get(id); }
  async getUserByEmail(email: string) { return [...this.userMap.values()].find(u => u.email === email); }
  async getUserByPhone(phone: string) { return [...this.userMap.values()].find(u => u.phone === phone); }
  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = { ...insertUser, id: this.nextUserId++, createdAt: new Date(), email: insertUser.email ?? null, phone: insertUser.phone ?? null, passwordHash: insertUser.passwordHash ?? null, handicapIndex: insertUser.handicapIndex ?? null, homeCourse: insertUser.homeCourse ?? null, avatarUrl: insertUser.avatarUrl ?? null };
    this.userMap.set(user.id, user);
    return user;
  }
  async updateUser(id: number, updates: Partial<InsertUser>) {
    const u = this.userMap.get(id);
    if (!u) return undefined;
    const updated = { ...u, ...updates };
    this.userMap.set(id, updated);
    return updated;
  }
  async createOtp(_contact: string, _code: string, _expiresAt: Date) {}
  async verifyOtp(_contact: string, _code: string) { return false; }

  // OAuth stubs (not supported in memory mode)
  async getOAuthAccount(_provider: string, _providerId: string): Promise<import("@shared/schema").OAuthAccount | undefined> { return undefined; }
  async createOAuthAccount(userId: number, provider: string, providerId: string, email?: string | null): Promise<import("@shared/schema").OAuthAccount> {
    return { id: 1, userId, provider, providerId, email: email ?? null, createdAt: new Date() };
  }
  async linkOAuthAccount(userId: number, provider: string, providerId: string, email?: string | null): Promise<import("@shared/schema").OAuthAccount | undefined> {
    return this.createOAuthAccount(userId, provider, providerId, email);
  }

  // Favorites stubs (not supported in memory mode)
  async getFavorites(_userId: number): Promise<(import("@shared/schema").Favorite & { avatarUrl: string | null })[]> { return []; }
  async addFavorite(_userId: number, _favoriteUserId: number, _favoriteName: string): Promise<import("@shared/schema").Favorite> {
    return { id: 1, userId: _userId, favoriteUserId: _favoriteUserId, favoriteName: _favoriteName, createdAt: new Date() };
  }
  async removeFavorite(_userId: number, _favoriteUserId: number): Promise<boolean> { return true; }
  async searchUsers(_query: string, _excludeUserId: number): Promise<import("@shared/schema").User[]> { return []; }
}

// ── Export singleton ──────────────────────────────────────────────────────────

function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    return new DatabaseStorage();
  }
  return new MemStorage();
}

export const storage = createStorage();
