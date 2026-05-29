import { eq, desc, and, or, ilike, sql as sqlOp } from "drizzle-orm";
import { db, pool } from "./db";
import { games, users, otpCodes, oauthAccounts, favorites, tournaments, tournamentPlayers } from "@shared/schema";
import type { Game, InsertGame, UpdateGame, User, InsertUser, OAuthAccount, Favorite, Tournament, InsertTournament, TournamentPlayer, InsertTournamentPlayer, LeaderboardEntry } from "@shared/schema";
import { generateInviteCode } from "@shared/schema";
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
  getGamesByPlayerName(name: string): Promise<Game[]>;
  getGamesBySession(sessionId: string): Promise<Game[]>;
  linkGamesToUser(sessionId: string, userId: number): Promise<number>;
  getGamesByTournament(tournamentId: string): Promise<Game[]>;

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

  // Tournaments
  createTournament(data: Omit<InsertTournament, "inviteCode">): Promise<Tournament>;
  getTournament(id: string): Promise<Tournament | undefined>;
  getTournamentByInviteCode(code: string): Promise<Tournament | undefined>;
  updateTournament(id: string, updates: Partial<Tournament>): Promise<Tournament | undefined>;
  deleteTournament(id: string): Promise<boolean>;
  joinTournament(tournamentId: string, userId: number, playerName: string): Promise<TournamentPlayer>;
  leaveTournament(tournamentId: string, userId: number): Promise<boolean>;
  getTournamentPlayers(tournamentId: string): Promise<(TournamentPlayer & { avatarUrl: string | null })[]>;
  getTournamentGames(tournamentId: string): Promise<Game[]>;
  getTournamentLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]>;
  updateTournamentStatus(tournamentId: string, status: string): Promise<Tournament | undefined>;
  getTournamentsByUser(userId: number): Promise<(Tournament & { playerCount: number })[]>;
  getTournamentsByCreator(userId: number): Promise<Tournament[]>;
  updateTournamentPlayerStatus(tournamentId: string, userId: number, status: string): Promise<void>;

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
      miniGames: (insertGame as any).miniGames ?? {},
      tournamentId: (insertGame as any).tournamentId ?? null,
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

  async getGamesByPlayerName(name: string): Promise<Game[]> {
    // JSONB contains: players array contains the name string
    return db
      .select()
      .from(games)
      .where(sqlOp`${games.players} @> ${JSON.stringify([name])}`)
      .orderBy(desc(games.createdAt));
  }

  async getGamesBySession(sessionId: string): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(sqlOp`${games.sessionId} = ${sessionId}`);
  }

  async linkGamesToUser(sessionId: string, userId: number): Promise<number> {
    const sessionGames = await this.getGamesBySession(sessionId);
    if (sessionGames.length === 0) return 0;
    // Only link games that don't already have a userId
    const unlinked = sessionGames.filter(g => g.userId === null);
    for (const game of unlinked) {
      await db.update(games).set({ userId }).where(sqlOp`${games.id} = ${game.id}`);
    }
    return unlinked.length;
  }

  async getGamesByTournament(tournamentId: string): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(eq(games.tournamentId, tournamentId))
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

  // Tournaments ───────────────────────────────────────────────────────────────

  async createTournament(data: Omit<InsertTournament, "inviteCode">): Promise<Tournament> {
    // Generate unique invite code
    let inviteCode = generateInviteCode();
    let existing = await this.getTournamentByInviteCode(inviteCode);
    while (existing) {
      inviteCode = generateInviteCode();
      existing = await this.getTournamentByInviteCode(inviteCode);
    }

    const [tournament] = await db
      .insert(tournaments)
      .values({
        ...data,
        inviteCode,
      })
      .returning();
    return tournament;
  }

  async getTournament(id: string): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    return tournament;
  }

  async getTournamentByInviteCode(code: string): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.inviteCode, code));
    return tournament;
  }

  async updateTournament(id: string, updates: Partial<Tournament>): Promise<Tournament | undefined> {
    const [tournament] = await db
      .update(tournaments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tournaments.id, id))
      .returning();
    return tournament;
  }

  async deleteTournament(id: string): Promise<boolean> {
    const result = await db.delete(tournaments).where(eq(tournaments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async joinTournament(tournamentId: string, userId: number, playerName: string): Promise<TournamentPlayer> {
    // Check if already joined
    const [existing] = await db
      .select()
      .from(tournamentPlayers)
      .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
    if (existing) return existing;

    const [tp] = await db
      .insert(tournamentPlayers)
      .values({ tournamentId, userId, playerName, status: "registered" })
      .returning();
    return tp;
  }

  async leaveTournament(tournamentId: string, userId: number): Promise<boolean> {
    const result = await db
      .delete(tournamentPlayers)
      .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }

  async getTournamentPlayers(tournamentId: string): Promise<(TournamentPlayer & { avatarUrl: string | null })[]> {
    const rows = await db
      .select({
        id: tournamentPlayers.id,
        tournamentId: tournamentPlayers.tournamentId,
        userId: tournamentPlayers.userId,
        playerName: tournamentPlayers.playerName,
        status: tournamentPlayers.status,
        createdAt: tournamentPlayers.createdAt,
        avatarUrl: users.avatarUrl,
      })
      .from(tournamentPlayers)
      .leftJoin(users, eq(tournamentPlayers.userId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId))
      .orderBy(tournamentPlayers.createdAt);
    return rows as any[];
  }

  async getTournamentGames(tournamentId: string): Promise<Game[]> {
    return this.getGamesByTournament(tournamentId);
  }

  async getTournamentLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]> {
    const tournamentGames = await this.getGamesByTournament(tournamentId);
    const tPlayers = await this.getTournamentPlayers(tournamentId);

    // Build a map of user_id → player_name for registered tournament players
    const playerMap = new Map<number, string>();
    for (const tp of tPlayers) {
      playerMap.set(tp.userId, tp.playerName);
    }

    // For each game, find which players are registered tournament players
    // and extract their scores
    const entries: LeaderboardEntry[] = [];

    for (const game of tournamentGames) {
      const gamePlayers = game.players as string[];
      const totalScores = game.totalScores as Record<string, number>;
      const handicaps = game.handicaps as Record<string, number>;
      const holeHistory = game.holeHistory as Array<{ hole: number; strokes: Record<string, number> }>;
      const holesCompleted = holeHistory.length;

      for (const playerName of gamePlayers) {
        // Look up userId for this player name
        // First check if they're a registered tournament player
        let matchedUserId: number | null = null;
        for (const tp of tPlayers) {
          if (tp.playerName === playerName) {
            matchedUserId = tp.userId;
            break;
          }
        }

        // Only include registered tournament players on leaderboard
        if (matchedUserId === null) continue;

        const totalStrokes = totalScores[playerName] ?? 0;
        const handicap = handicaps[playerName] ?? 0;
        const netStrokes = totalStrokes - Math.round(handicap);

        entries.push({
          position: 0,
          playerName,
          userId: matchedUserId,
          totalStrokes,
          netStrokes,
          handicap,
          holesCompleted,
          complete: !game.active && holesCompleted > 0,
          gameId: game.id,
        });
      }
    }

    // Sort: completed rounds first, then by net ascending, then gross ascending
    entries.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      if (a.netStrokes !== b.netStrokes) return a.netStrokes - b.netStrokes;
      if (a.totalStrokes !== b.totalStrokes) return a.totalStrokes - b.totalStrokes;
      return b.holesCompleted - a.holesCompleted;
    });

    // Assign positions (handle ties)
    let pos = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0) {
        const prev = entries[i - 1];
        const curr = entries[i];
        if (prev.complete === curr.complete &&
            prev.netStrokes === curr.netStrokes &&
            prev.totalStrokes === curr.totalStrokes) {
          // Same position as previous (tie)
          entries[i].position = prev.position;
        } else {
          entries[i].position = i + 1;
        }
      } else {
        entries[i].position = 1;
      }
    }

    return entries;
  }

  async updateTournamentStatus(tournamentId: string, status: string): Promise<Tournament | undefined> {
    return this.updateTournament(tournamentId, { status } as any);
  }

  async getTournamentsByUser(userId: number): Promise<(Tournament & { playerCount: number })[]> {
    // Get tournaments where user is a player
    const playerRows = await db
      .select({ tournamentId: tournamentPlayers.tournamentId })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.userId, userId));

    const tournamentIds = playerRows.map(r => r.tournamentId);
    if (tournamentIds.length === 0) return [];

    const result: (Tournament & { playerCount: number })[] = [];
    for (const tid of tournamentIds) {
      const t = await this.getTournament(tid);
      if (!t) continue;
      const players = await this.getTournamentPlayers(tid);
      result.push({ ...t, playerCount: players.length });
    }

    // Sort by date descending, then status (in_progress > open > complete)
    result.sort((a, b) => {
      const statusOrder: Record<string, number> = { in_progress: 0, open: 1, complete: 2, cancelled: 3 };
      const statusDiff = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return result;
  }

  async getTournamentsByCreator(userId: number): Promise<Tournament[]> {
    return db
      .select()
      .from(tournaments)
      .where(eq(tournaments.creatorId, userId))
      .orderBy(desc(tournaments.createdAt));
  }

  async updateTournamentPlayerStatus(tournamentId: string, userId: number, status: string): Promise<void> {
    await db
      .update(tournamentPlayers)
      .set({ status })
      .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
  }
}

// ── Fallback in-memory (games only, no user persistence) ─────────────────────

export class MemStorage implements IStorage {
  private gameMap: Map<string, Game> = new Map();
  private userMap: Map<number, User> = new Map();
  private tournamentMap: Map<string, Tournament> = new Map();
  private tournamentPlayerMap: Map<number, TournamentPlayer> = new Map();
  private nextUserId = 1;
  private nextTournamentPlayerId = 1;
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });
  }

  async getGame(id: string) { return this.gameMap.get(id); }
  async getGamesByUser(userId: number) {
    return [...this.gameMap.values()].filter(g => g.userId === userId);
  }
  async getGamesByPlayerName(name: string) {
    return [...this.gameMap.values()].filter(g => (g.players as string[]).includes(name));
  }
  async getGamesBySession(sessionId: string) {
    return [...this.gameMap.values()].filter(g => g.sessionId === sessionId);
  }
  async linkGamesToUser(sessionId: string, userId: number) {
    const sessionGames = [...this.gameMap.values()].filter(g => g.sessionId === sessionId && g.userId === null);
    for (const game of sessionGames) {
      game.userId = userId;
    }
    return sessionGames.length;
  }
  async getGamesByTournament(tournamentId: string) {
    return [...this.gameMap.values()].filter(g => g.tournamentId === tournamentId);
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
      sessionId: insertGame.sessionId ?? null,
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
      miniGames: (insertGame as any).miniGames ?? {},
      tournamentId: (insertGame as any).tournamentId ?? null,
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

  // Tournament stubs (not supported in memory mode)
  async createTournament(data: Omit<InsertTournament, "inviteCode">): Promise<Tournament> {
    const id = randomUUID();
    const now = new Date();
    const t: Tournament = {
      id,
      creatorId: data.creatorId ?? null,
      name: data.name,
      date: data.date,
      courseName: data.courseName ?? "",
      courseId: data.courseId ?? null,
      format: data.format ?? "stroke_play",
      maxPlayers: data.maxPlayers ?? null,
      inviteCode: generateInviteCode(),
      status: data.status ?? "open",
      settings: data.settings ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.tournamentMap.set(id, t);
    return t;
  }
  async getTournament(id: string): Promise<Tournament | undefined> { return this.tournamentMap.get(id); }
  async getTournamentByInviteCode(code: string): Promise<Tournament | undefined> {
    return [...this.tournamentMap.values()].find(t => t.inviteCode === code);
  }
  async updateTournament(id: string, updates: Partial<Tournament>): Promise<Tournament | undefined> {
    const t = this.tournamentMap.get(id);
    if (!t) return undefined;
    const updated = { ...t, ...updates, updatedAt: new Date() };
    this.tournamentMap.set(id, updated);
    return updated;
  }
  async deleteTournament(id: string): Promise<boolean> { return this.tournamentMap.delete(id); }
  async joinTournament(tournamentId: string, userId: number, playerName: string): Promise<TournamentPlayer> {
    const existing = [...this.tournamentPlayerMap.values()].find(
      tp => tp.tournamentId === tournamentId && tp.userId === userId
    );
    if (existing) return existing;
    const tp: TournamentPlayer = {
      id: this.nextTournamentPlayerId++,
      tournamentId, userId, playerName,
      status: "registered",
      createdAt: new Date(),
    };
    this.tournamentPlayerMap.set(tp.id, tp);
    return tp;
  }
  async leaveTournament(tournamentId: string, userId: number): Promise<boolean> {
    for (const [key, tp] of this.tournamentPlayerMap.entries()) {
      if (tp.tournamentId === tournamentId && tp.userId === userId) {
        this.tournamentPlayerMap.delete(key);
        return true;
      }
    }
    return false;
  }
  async getTournamentPlayers(tournamentId: string): Promise<(TournamentPlayer & { avatarUrl: string | null })[]> {
    return [...this.tournamentPlayerMap.values()]
      .filter(tp => tp.tournamentId === tournamentId)
      .map(tp => ({ ...tp, avatarUrl: null }));
  }
  async getTournamentGames(tournamentId: string): Promise<Game[]> {
    return this.getGamesByTournament(tournamentId);
  }
  async getTournamentLeaderboard(tournamentId: string): Promise<LeaderboardEntry[]> { return []; }
  async updateTournamentStatus(tournamentId: string, status: string): Promise<Tournament | undefined> {
    return this.updateTournament(tournamentId, { status } as any);
  }
  async getTournamentsByUser(userId: number): Promise<(Tournament & { playerCount: number })[]> { return []; }
  async getTournamentsByCreator(userId: number): Promise<Tournament[]> { return []; }
  async updateTournamentPlayerStatus(tournamentId: string, userId: number, status: string): Promise<void> {}
}

// ── Export singleton ──────────────────────────────────────────────────────────

function createStorage(): IStorage {
  if (process.env.DATABASE_URL) {
    return new DatabaseStorage();
  }
  return new MemStorage();
}

export const storage = createStorage();
