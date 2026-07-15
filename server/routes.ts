import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertGameSchema, updateGameSchema, wsMessageSchema, validatePlayers, sanitizePlayerName, insertTournamentSchema } from "@shared/schema";
import type { Game } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";

const gameConnections = new Map<string, Set<WebSocket>>();
const tournamentConnections = new Map<string, Set<WebSocket>>();

const GOLF_API_BASE = "https://api.opengolfapi.org/v1";

// Known course data overrides — corrects bad OpenGolfAPI data (wrong pars, missing handicap ranks)
// Add entries here when the API returns incorrect scorecard data for a course.
const COURSE_OVERRIDES: Record<string, { name: string; par: number; pars: number[]; hcpRanks: number[] }> = {
  // Rock Hill Country Club, Rock Hill SC — API returns all par-5 for holes 1-13 and no handicap data
  "56d19e5f-ed82-4cf3-b9d1-d6066decb863": {
    name: "Rock Hill Country Club",
    par: 72,
    pars: [4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 5, 4, 3, 4],
    hcpRanks: [11, 17, 7, 9, 3, 13, 15, 1, 5, 8, 2, 10, 6, 4, 12, 18, 16, 14],
  },
};

/**
 * Self-heal strokes array from holeHistory.
 * Reconstructs each player's strokes array so it matches holeHistory exactly.
 * Returns the game object (mutates in place for efficiency on reads).
 */
function fixStrokes(game: Game): Game {
  if (!game.holeHistory || game.holeHistory.length === 0) return game;
  const fixed: Record<string, number[]> = {};
  for (const player of game.players) {
    fixed[player] = [];
  }
  for (const hole of game.holeHistory) {
    for (const [player, score] of Object.entries(hole.strokes)) {
      if (!fixed[player]) fixed[player] = [];
      fixed[player][hole.hole - 1] = score as number;
    }
  }
  // Fill any gaps with 0
  for (const player of game.players) {
    for (let i = 0; i < game.holeHistory.length; i++) {
      if (fixed[player][i] === undefined) fixed[player][i] = 0;
    }
  }
  game.strokes = fixed;
  return game;
}

/**
 * Recalculate a single hole after stroke edit.
 * Returns a partial update object for storage.updateGame().
 * - Replaces the holeHistory entry with new strokes
 * - Recalculates points for that hole using calcHoleResult logic
 * - Recomputes totalScores from all holeHistory entries
 * - Updates the strokes array
 */
function recalculateHole(game: Game, holeNumber: number, newStrokes: Record<string, number>) {
  const holeIdx = game.holeHistory.findIndex(h => h.hole === holeNumber);
  if (holeIdx === -1) throw new Error(`Hole ${holeNumber} not found in history`);

  // Update strokes array for all players
  const updatedStrokes = { ...game.strokes };
  for (const [player, strokeCount] of Object.entries(newStrokes)) {
    if (!updatedStrokes[player]) updatedStrokes[player] = [];
    while (updatedStrokes[player].length < holeNumber) updatedStrokes[player].push(0);
    updatedStrokes[player][holeNumber - 1] = strokeCount;
  }

  // Recalculate points for this hole
  const oldEntry = game.holeHistory[holeIdx];
  const newEntry = {
    ...oldEntry,
    strokes: newStrokes,
    // Points and result need recalculation — we re-derive from game type
    points: recalcHolePoints(game, holeNumber, newStrokes, oldEntry),
    result: oldEntry.result, // Keep original result text (descriptive)
  };

  // Replace the entry
  const newHistory = [...game.holeHistory];
  newHistory[holeIdx] = newEntry;

  // Recompute totalScores from scratch
  const totalScores: Record<string, number> = {};
  for (const player of game.players) totalScores[player] = 0;
  for (const hole of newHistory) {
    for (const [player, pts] of Object.entries(hole.points)) {
      totalScores[player] = (totalScores[player] || 0) + (pts as number);
    }
  }

  return {
    strokes: updatedStrokes,
    holeHistory: newHistory,
    totalScores,
  };
}

/**
 * Recalculate points for a single hole based on game type and new strokes.
 * Uses the same logic as game-logic.ts calcHoleResult but server-side.
 */
function recalcHolePoints(
  game: Game,
  holeNumber: number,
  newStrokes: Record<string, number>,
  oldEntry: Game["holeHistory"][number],
): Record<string, number> {
  const { gameType, players, handicaps, pars } = game;
  const par = pars[holeNumber - 1] || 4;
  const strokeIdx = game.strokeIndexes?.[holeNumber - 1] ?? holeNumber;

  // Net strokes for each player
  const netStrokes: Record<string, number> = {};
  for (const p of players) {
    const gross = newStrokes[p] || 0;
    const hc = handicaps[p] || 0;
    const strokesReceived = hc >= strokeIdx ? 1 : 0;
    netStrokes[p] = gross - strokesReceived;
  }

  // For most game types, points scale is determined by the old entry
  // We preserve the point structure but adjust based on new winner/diff
  const oldPoints = oldEntry.points;
  const oldTotal = Object.values(oldPoints).reduce((a: number, b) => a + (b as number), 0);

  // Determine winner(s) by net strokes
  const sorted = players
    .map(p => ({ player: p, net: netStrokes[p] || 0, gross: newStrokes[p] || 0 }))
    .sort((a, b) => a.net - b.net);

  const minNet = sorted[0]?.net ?? 0;
  const winners = sorted.filter(s => s.net === minNet);
  const isTie = winners.length > 1;

  // Scale points: keep the same total magnitude, distribute to new winner
  // For tied: split evenly (or carry over — keep original behavior)
  const newPoints: Record<string, number> = {};
  for (const p of players) newPoints[p] = 0;

  if (isTie) {
    // Tie — all zero (carryover handled externally)
  } else {
    const winner = winners[0].player;
    // Preserve the absolute point total from the old entry
    const absTotal = Object.values(oldPoints).reduce((a: number, b) => a + Math.abs(b as number), 0);
    // Award to winner, deduct from others
    if (players.length === 2) {
      newPoints[winner] = Math.round(absTotal / 2) || 1;
      const loser = players.find(p => p !== winner)!;
      newPoints[loser] = -newPoints[winner];
    } else {
      // Multi-player: winner gets sum of deductions from others
      const perPlayer = Math.round(absTotal / (players.length - 1)) || 1;
      for (const p of players) {
        newPoints[p] = p === winner ? perPlayer * (players.length - 1) : -perPlayer;
      }
    }
  }

  return newPoints;
}

async function fetchGolfApi(path: string) {
  const res = await fetch(`${GOLF_API_BASE}${path}`);
  if (!res.ok) throw new Error(`Golf API error: ${res.status}`);
  return res.json();
}

/**
 * Search OpenStreetMap (Nominatim) for golf courses worldwide.
 * Returns name + location only — no scorecard/pars data.
 * Timeout ensures it never blocks the response if Nominatim is slow.
 */
async function searchOsmCourses(query: string, timeoutMs = 3000): Promise<any[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + " golf course")}&format=json&limit=20&addressdetails=1&accept-language=en`;
    const res = await fetch(nominatimUrl, {
      headers: { "User-Agent": "PinPlayGolf/1.0" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data: any[] = await res.json();
    const seen = new Set<string>();
    return data
      .filter((d: any) =>
        (d.class === "leisure" && d.type === "golf_course") ||
        (d.display_name || "").toLowerCase().includes("golf") ||
        (d.display_name || "").toLowerCase().includes("course"))
      .map((d: any) => {
        const addr = d.address || {};
        const name = d.name || (d.display_name || "").split(",")[0].trim();
        const city = addr.city || addr.town || addr.village || addr.hamlet || "";
        const state = addr.state || addr.county || "";
        const country = addr.country || "";
        const locKey = `${name}::${city}::${country}`.toLowerCase();
        const id = `osm-${d.osm_type}-${d.osm_id}`;
        return { id, name, city, state, country, locKey, par: 0, holes: 0 };
      })
      .filter((c: any) => {
        if (seen.has(c.locKey)) return false;
        seen.add(c.locKey);
        return true;
      })
      .slice(0, 8);
  } catch {
    return []; // timeout or error — never block the response
  } finally {
    clearTimeout(timer);
  }
}

// ── Tournament WebSocket broadcasting ────────────────────────────────────────

function joinTournamentRoom(tournamentId: string, ws: WebSocket) {
  if (!tournamentConnections.has(tournamentId)) tournamentConnections.set(tournamentId, new Set());
  tournamentConnections.get(tournamentId)!.add(ws);
}

function leaveTournamentRoom(tournamentId: string, ws: WebSocket) {
  const conns = tournamentConnections.get(tournamentId);
  if (conns) { conns.delete(ws); if (conns.size === 0) tournamentConnections.delete(tournamentId); }
}

function broadcastToTournament(tournamentId: string, message: any) {
  const conns = tournamentConnections.get(tournamentId);
  if (conns) {
    const str = JSON.stringify(message);
    conns.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(str); });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes (passport init happens inside)
  setupAuth(app);

  // Apple App Site Association (Universal Links / deep links)
  app.get("/.well-known/apple-app-site-association", (_req, res) => {
    res.set("Content-Type", "application/json");
    res.json({
      applinks: {
        details: [
          {
            appIDs: ["UP49GYJACS.com.silverspringsventures.pinplay"],
            components: [
              { "/": "/join/*", comment: "Tournament invite deep links" },
              { "/": "/tournament/*", comment: "Tournament pages" },
            ],
          },
        ],
      },
    });
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  // Admin stats (requires ADMIN_SECRET env var passed as ?key=...)
  app.get("/api/admin/stats", async (req, res) => {
    const adminSecret = process.env.ADMIN_SECRET;
    const providedKey = req.query.key as string;
    if (!adminSecret || providedKey !== adminSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const [userCount, gameCount, activeGames, completedGames] = await Promise.all([
        db.select({ id: schema.users.id }).from(schema.users),
        db.select({ id: schema.games.id }).from(schema.games),
        db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.active, true)),
        db.select({ id: schema.games.id }).from(schema.games).where(eq(schema.games.active, false)),
      ]);
      const oauthUsers = await db.select({ id: schema.oauthAccounts.id }).from(schema.oauthAccounts);

      res.json({
        users: userCount.length,
        games: gameCount.length,
        activeGames: activeGames.length,
        completedGames: completedGames.length,
        oauthConnections: oauthUsers.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Golf course search — US courses from OpenGolfAPI, international from OpenStreetMap
  app.get("/api/courses/search", async (req, res) => {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 2) return res.json({ courses: [] });

    // Run both searches in parallel; OSM is timeout-guarded so it never blocks
    const [ogResult, osmResult] = await Promise.allSettled([
      fetchGolfApi(`/courses/search?q=${encodeURIComponent(q)}&limit=8`),
      searchOsmCourses(q),
    ]);

    // OpenGolfAPI results — US courses with scorecards
    let courses: any[] = [];
    if (ogResult.status === "fulfilled") {
      courses = (ogResult.value.courses || []).map((c: any) => ({
        id: c.id,
        name: c.name || c.course_name || c.club_name,
        city: c.city,
        state: c.state,
        country: "US",
        par: c.par || c.par_total,
        holes: c.holes || c.holes_count,
      }));
    }

    // OSM results — international courses (no scorecard)
    // Append after US courses, dedupe by name
    if (osmResult.status === "fulfilled" && osmResult.value.length > 0) {
      const existingNames = new Set(courses.map((c: any) => c.name.toLowerCase()));
      const osmCourses = osmResult.value
        .filter((c: any) => {
          const key = c.name.toLowerCase();
          if (existingNames.has(key)) return false;
          existingNames.add(key);
          return true;
        })
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          city: c.city,
          state: c.state,
          country: c.country,
          par: 0,
          holes: 0,
        }));
      courses = [...courses, ...osmCourses];
    }

    res.json({ courses });
  });

  // Golf course detail
  app.get("/api/courses/:id", async (req, res) => {
    // OSM courses (international) don't have scorecard data
    if (req.params.id.startsWith("osm-")) {
      return res.status(404).json({ message: "International course — no scorecard data available" });
    }

    // Check overrides first — use corrected data when API data is known to be wrong
    const override = COURSE_OVERRIDES[req.params.id];
    if (override) {
      return res.json({
        id: req.params.id,
        name: override.name,
        city: "",
        state: "",
        par: override.par,
        pars: override.pars,
        hcpRanks: override.hcpRanks,
        _overridden: true,
      });
    }

    try {
      const data = await fetchGolfApi(`/courses/${req.params.id}`);
      const pars: number[] = [];
      const hcpRanks: number[] = [];
      if (Array.isArray(data.scorecard) && data.scorecard.length > 0) {
        const sorted = [...data.scorecard].sort((a: any, b: any) => (a.hole ?? a.hole_number ?? 0) - (b.hole ?? b.hole_number ?? 0));
        sorted.forEach((h: any) => {
          pars.push(h.par || 4);
          const rank = h.handicap ?? h.stroke_index ?? h.hcp ?? h.handicap_index ?? h.strokeIndex ?? h.si ?? h.difficulty ?? null;
          hcpRanks.push(rank);
        });
      }
      while (pars.length < 18) pars.push(4);
      while (hcpRanks.length < 18) hcpRanks.push(null as any);
      const validHcpRanks = hcpRanks.length === 18 && hcpRanks.every(r => typeof r === "number" && r >= 1 && r <= 18) ? hcpRanks : null;
      res.json({ id: data.id, name: data.name || data.course_name || data.club_name, city: data.city, state: data.state, par: data.par || data.par_total, pars: pars.slice(0, 18), hcpRanks: validHcpRanks });
    } catch {
      res.status(500).json({ message: "Could not load course data" });
    }
  });

  // Create game
  app.post("/api/games", async (req, res) => {
    try {
      // Sanitize player names
      if (req.body.players) {
        req.body.players = validatePlayers(req.body.players);
      }
      // Sanitize player names in handicaps keys
      if (req.body.handicaps && typeof req.body.handicaps === "object") {
        const clean: Record<string, number> = {};
        for (const [key, val] of Object.entries(req.body.handicaps)) {
          clean[sanitizePlayerName(key)] = val as number;
        }
        req.body.handicaps = clean;
      }
      // Sanitize course name
      if (typeof req.body.courseName === "string") {
        req.body.courseName = req.body.courseName.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 200);
      }
      const gameData = insertGameSchema.parse(req.body);
      // Attach userId if logged in
      if (req.isAuthenticated?.() && req.user) {
        (gameData as any).userId = (req.user as any).id;
      }
      // Always store session ID so games can be linked if user logs in later
      (gameData as any).sessionId = req.sessionID;
      const game = await storage.createGame(gameData);
      res.json(game);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid game data" });
    }
  });

  // Get game
  app.get("/api/games/:id", async (req, res) => {
    try {
      const game = await storage.getGame(req.params.id);
      if (!game) return res.status(404).json({ message: "Game not found" });
      res.json(fixStrokes(game));
    } catch {
      res.status(500).json({ message: "Failed to fetch game" });
    }
  });

  // Resolve multiple game IDs (for guest game recovery)
  // Returns only active (non-completed) games the caller has access to.
  app.post("/api/games/resolve", async (req, res) => {
    try {
      const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids : [];
      if (ids.length === 0) return res.json({ games: [] });
      // Cap to prevent abuse
      const capped = ids.slice(0, 20);
      const found = await storage.getGamesByIds(capped);
      // Only return active games
      const activeGames = found
        .filter(g => g.active !== false)
        .map(g => fixStrokes(g));
      res.json({ games: activeGames });
    } catch (error) {
      console.error("games/resolve error:", error);
      res.status(500).json({ message: "Failed to resolve games" });
    }
  });

  // Delete game (only the creator can delete)
  app.delete("/api/games/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: "Not authenticated" });
      const game = await storage.getGame(req.params.id);
      if (!game) return res.status(404).json({ message: "Game not found" });
      if (game.userId !== (req.user as any).id) return res.status(403).json({ message: "Only the game creator can delete this game" });
      await storage.deleteGame(req.params.id);
      broadcastToGame(req.params.id, { type: "game_updated", game: { ...game, active: false, deleted: true } });
      res.json({ message: "Game deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete game" });
    }
  });

  // Claim game — link a completed/shared game to the logged-in user
  app.post("/api/games/:id/claim", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) return res.status(401).json({ message: "Not authenticated" });
      const game = await storage.getGame(req.params.id);
      if (!game) return res.status(404).json({ message: "Game not found" });
      const userId = (req.user as any).id;
      const { playerName } = req.body;
      // Set userId on the game if it doesn't have one (or it's this session's game)
      if (game.userId === null) {
        await storage.updateGame(req.params.id, { userId } as any);
      }
      res.json({ message: "Game claimed", playerName: playerName || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to claim game" });
    }
  });

  // Update game
  app.patch("/api/games/:id", async (req, res) => {
    try {
      const updates = updateGameSchema.parse(req.body);
      const game = await storage.updateGame(req.params.id, updates);
      if (!game) return res.status(404).json({ message: "Game not found" });
      broadcastToGame(req.params.id, { type: "game_updated", game });
      // If this game is part of a tournament, broadcast tournament update
      if (game.tournamentId) {
        broadcastTournamentScoreUpdate(game.tournamentId, game);
      }
      res.json(game);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid update data" });
    }
  });

  // Edit a completed hole's strokes — recalculates points and totals
  app.patch("/api/games/:id/hole/:holeNumber", async (req, res) => {
    try {
      const holeNumber = parseInt(req.params.holeNumber, 10);
      if (holeNumber < 1 || holeNumber > 18) return res.status(400).json({ message: "Invalid hole number" });
      const { strokes } = req.body as { strokes: Record<string, number> };
      if (!strokes || typeof strokes !== "object") return res.status(400).json({ message: "Missing strokes" });

      const game = await storage.getGame(req.params.id);
      if (!game) return res.status(404).json({ message: "Game not found" });

      const edited = recalculateHole(game, holeNumber, strokes);
      const updated = await storage.updateGame(req.params.id, edited);
      if (!updated) return res.status(500).json({ message: "Failed to update" });
      broadcastToGame(req.params.id, { type: "game_updated", game: fixStrokes(updated) });
      // If this game is part of a tournament, broadcast tournament update
      if (updated.tournamentId) {
        broadcastTournamentScoreUpdate(updated.tournamentId, updated);
      }
      res.json(fixStrokes(updated));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to edit hole" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TOURNAMENT ROUTES
  // ═══════════════════════════════════════════════════════════════════════════

  // Create tournament (auth required)
  app.post("/api/tournaments", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const { name, date, courseName, courseId, format, maxPlayers, settings } = req.body;

      if (!name || typeof name !== "string" || name.trim().length < 1) {
        return res.status(400).json({ message: "Tournament name is required" });
      }
      if (!date) {
        return res.status(400).json({ message: "Tournament date is required" });
      }

      const tournament = await storage.createTournament({
        creatorId: user.id,
        name: name.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 200),
        date: new Date(date),
        courseName: courseName?.trim() || "",
        courseId: courseId || null,
        format: format || "stroke_play",
        maxPlayers: maxPlayers || null,
        settings: settings || {},
        status: "open",
      });

      // Auto-join the creator
      await storage.joinTournament(tournament.id, user.id, user.name);

      // Return tournament with creator auto-joined
      const players = await storage.getTournamentPlayers(tournament.id);
      res.status(201).json({ ...tournament, players });
    } catch (error) {
      console.error("Create tournament error:", error);
      res.status(500).json({ message: "Failed to create tournament" });
    }
  });

  // Get tournament + players (public)
  app.get("/api/tournaments/:id", async (req, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      const players = await storage.getTournamentPlayers(req.params.id);
      const games = await storage.getTournamentGames(req.params.id);
      const teams = await storage.getTournamentTeams(req.params.id);

      // Get creator info
      let creator = null;
      if (tournament.creatorId) {
        const creatorUser = await storage.getUser(tournament.creatorId);
        if (creatorUser) {
          const { passwordHash, ...safe } = creatorUser;
          creator = safe;
        }
      }

      // Check if current user is registered
      let isRegistered = false;
      let isCreator = false;
      if (req.isAuthenticated?.() && req.user) {
        const userId = (req.user as any).id;
        isRegistered = players.some(p => p.userId === userId);
        isCreator = tournament.creatorId === userId;
      }

      res.json({
        ...tournament,
        players,
        games,
        teams,
        creator,
        isRegistered,
        isCreator,
        playerCount: players.length,
      });
    } catch (error) {
      console.error("Get tournament error:", error);
      res.status(500).json({ message: "Failed to fetch tournament" });
    }
  });

  // Get tournament leaderboard (public)
  app.get("/api/tournaments/:id/leaderboard", async (req, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      const leaderboard = await storage.getTournamentLeaderboard(req.params.id, req.query.view as string);
      res.json(leaderboard);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  // Join tournament (auth required)
  app.post("/api/tournaments/:id/join", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      // Check if tournament is joinable
      if (tournament.status === "cancelled") {
        return res.status(400).json({ message: "Tournament has been cancelled" });
      }
      if (tournament.status === "complete") {
        return res.status(400).json({ message: "Tournament is already complete" });
      }

      // Check max players
      if (tournament.maxPlayers) {
        const players = await storage.getTournamentPlayers(req.params.id);
        if (players.length >= tournament.maxPlayers) {
          return res.status(400).json({ message: "Tournament is full" });
        }
      }

      const tp = await storage.joinTournament(req.params.id, user.id, user.name);
      const updatedPlayers = await storage.getTournamentPlayers(req.params.id);

      // Broadcast tournament update
      const updatedTournament = await storage.getTournament(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...updatedTournament, players: updatedPlayers },
      });

      res.json({ player: tp, players: updatedPlayers });
    } catch (error) {
      console.error("Join tournament error:", error);
      res.status(500).json({ message: "Failed to join tournament" });
    }
  });

  // Leave tournament (auth required)
  app.delete("/api/tournaments/:id/leave", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      // Creator can't leave their own tournament
      if (tournament.creatorId === user.id) {
        return res.status(400).json({ message: "Tournament creator cannot leave. Cancel the tournament instead." });
      }

      const ok = await storage.leaveTournament(req.params.id, user.id);
      if (!ok) return res.status(400).json({ message: "You are not registered for this tournament" });

      const updatedPlayers = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...tournament, players: updatedPlayers },
      });

      res.json({ message: "Left tournament", players: updatedPlayers });
    } catch (error) {
      console.error("Leave tournament error:", error);
      res.status(500).json({ message: "Failed to leave tournament" });
    }
  });

  // Update tournament (creator only)
  app.patch("/api/tournaments/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can update this" });
      }

      const { name, date, courseName, courseId, format, maxPlayers, settings } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 200);
      if (date !== undefined) updates.date = new Date(date);
      if (courseName !== undefined) updates.courseName = courseName.trim();
      if (courseId !== undefined) updates.courseId = courseId;
      if (format !== undefined) updates.format = format;
      if (maxPlayers !== undefined) updates.maxPlayers = maxPlayers;
      if (settings !== undefined) updates.settings = settings;

      const updated = await storage.updateTournament(req.params.id, updates);
      if (!updated) return res.status(500).json({ message: "Failed to update tournament" });

      const players = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...updated, players },
      });

      res.json({ ...updated, players });
    } catch (error) {
      console.error("Update tournament error:", error);
      res.status(500).json({ message: "Failed to update tournament" });
    }
  });

  // Cancel tournament (creator only)
  app.delete("/api/tournaments/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can cancel this" });
      }

      const updated = await storage.updateTournamentStatus(req.params.id, "cancelled");
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...updated, status: "cancelled" },
      });

      res.json({ message: "Tournament cancelled", tournament: updated });
    } catch (error) {
      console.error("Cancel tournament error:", error);
      res.status(500).json({ message: "Failed to cancel tournament" });
    }
  });

  // Start tournament (creator only)
  app.post("/api/tournaments/:id/start", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can start this" });
      }
      if (tournament.status !== "open") {
        return res.status(400).json({ message: "Tournament must be in 'open' status to start" });
      }

      const updated = await storage.updateTournamentStatus(req.params.id, "in_progress");
      const players = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...updated, players, status: "in_progress" },
      });

      res.json({ ...updated, players });
    } catch (error) {
      console.error("Start tournament error:", error);
      res.status(500).json({ message: "Failed to start tournament" });
    }
  });

  // Complete tournament (creator only)
  app.post("/api/tournaments/:id/complete", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can complete this" });
      }
      if (tournament.status !== "in_progress") {
        return res.status(400).json({ message: "Tournament must be in progress to complete" });
      }

      const updated = await storage.updateTournamentStatus(req.params.id, "complete");
      const players = await storage.getTournamentPlayers(req.params.id);

      // Auto-update all player statuses to "finished"
      for (const player of players) {
        if (player.userId !== null) {
          await storage.updateTournamentPlayerStatus(req.params.id, player.userId, "finished");
        } else {
          await storage.updateTournamentPlayerStatusByName(req.params.id, player.playerName, "finished");
        }
      }

      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...updated, players, status: "complete" },
      });

      res.json({ ...updated, players });
    } catch (error) {
      console.error("Complete tournament error:", error);
      res.status(500).json({ message: "Failed to complete tournament" });
    }
  });

  // ── Tournament Teams (Phase 3: Teams and Groups) ──────────────────────────

  // Get teams for a tournament (public)
  app.get("/api/tournaments/:id/teams", async (req, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      const teams = await storage.getTournamentTeams(req.params.id);
      res.json(teams);
    } catch (error) {
      console.error("Get teams error:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Create a team (auth required)
  app.post("/api/tournaments/:id/teams", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      const { teamName, teamColor } = req.body;
      if (!teamName?.trim()) {
        return res.status(400).json({ message: "Team name is required" });
      }

      const team = await storage.createTournamentTeam(
        req.params.id,
        teamName.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 100),
        teamColor || "#4A90D9",
      );

      const teams = await storage.getTournamentTeams(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { teams },
      });

      res.status(201).json(team);
    } catch (error) {
      console.error("Create team error:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Update a team (creator only)
  app.patch("/api/tournaments/:id/teams/:teamId", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can edit teams" });
      }

      const updates: { teamName?: string; teamColor?: string } = {};
      if (req.body.teamName !== undefined) {
        updates.teamName = req.body.teamName.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 100);
      }
      if (req.body.teamColor !== undefined) {
        updates.teamColor = req.body.teamColor;
      }

      const updated = await storage.updateTournamentTeam(parseInt(req.params.teamId), updates);
      if (!updated) return res.status(404).json({ message: "Team not found" });

      const teams = await storage.getTournamentTeams(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { teams },
      });

      res.json(updated);
    } catch (error) {
      console.error("Update team error:", error);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Delete a team (creator only)
  app.delete("/api/tournaments/:id/teams/:teamId", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can delete teams" });
      }

      const ok = await storage.deleteTournamentTeam(parseInt(req.params.teamId));
      if (!ok) return res.status(404).json({ message: "Team not found" });

      const teams = await storage.getTournamentTeams(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { teams },
      });

      res.json({ message: "Team deleted" });
    } catch (error) {
      console.error("Delete team error:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Join a team (registered players only)
  app.post("/api/tournaments/:id/teams/:teamId/join", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      // Must be registered for the tournament
      const players = await storage.getTournamentPlayers(req.params.id);
      const playerRecord = players.find(p => p.userId === user.id);
      if (!playerRecord) {
        return res.status(400).json({ message: "You must be registered for this tournament to join a team" });
      }

      // Check team size limit if set in tournament settings
      const teamSize = (tournament.settings as any)?.teamSize || 4;
      const teams = await storage.getTournamentTeams(req.params.id);
      const targetTeam = teams.find(t => t.id === parseInt(req.params.teamId));
      if (!targetTeam) return res.status(404).json({ message: "Team not found" });
      if (targetTeam.memberCount >= teamSize) {
        return res.status(400).json({ message: `Team is full (max ${teamSize})` });
      }

      await storage.assignPlayerToTeam(req.params.id, user.name, parseInt(req.params.teamId));

      const updatedTeams = await storage.getTournamentTeams(req.params.id);
      const updatedPlayers = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { teams: updatedTeams, players: updatedPlayers },
      });

      res.json({ message: "Joined team", teams: updatedTeams });
    } catch (error) {
      console.error("Join team error:", error);
      res.status(500).json({ message: "Failed to join team" });
    }
  });

  // Leave a team (registered players only)
  app.delete("/api/tournaments/:id/teams/:teamId/leave", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      await storage.removePlayerFromTeam(req.params.id, user.name);

      const updatedTeams = await storage.getTournamentTeams(req.params.id);
      const updatedPlayers = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { teams: updatedTeams, players: updatedPlayers },
      });

      res.json({ message: "Left team", teams: updatedTeams });
    } catch (error) {
      console.error("Leave team error:", error);
      res.status(500).json({ message: "Failed to leave team" });
    }
  });

  // Get tournament games
  app.get("/api/tournaments/:id/games", async (req, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      const games = await storage.getTournamentGames(req.params.id);
      res.json(games);
    } catch (error) {
      console.error("Get tournament games error:", error);
      res.status(500).json({ message: "Failed to fetch tournament games" });
    }
  });

  // Start a game within a tournament (auth required)
  app.post("/api/tournaments/:id/games", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });

      if (tournament.status !== "in_progress") {
        return res.status(400).json({ message: "Tournament must be in progress to start games" });
      }

      // Check if player is registered (by userId for authed users, by session for guests)
      const tPlayers = await storage.getTournamentPlayers(req.params.id);
      const playerRecord = tPlayers.find(p => p.userId === user.id);
      if (!playerRecord) {
        return res.status(400).json({ message: "You must be registered for this tournament to start a game" });
      }

      // Sanitize player names
      if (req.body.players) {
        req.body.players = validatePlayers(req.body.players);
      }
      // Team-based game launch: auto-populate players from team roster
      if (req.body.teamId && !req.body.players) {
        const allPlayers = await storage.getTournamentPlayers(req.params.id);
        const teamPlayers = allPlayers.filter(p => p.teamId === req.body.teamId);
        if (teamPlayers.length < 2) {
          return res.status(400).json({ message: "Team needs at least 2 players to start a team game" });
        }
        req.body.players = validatePlayers(teamPlayers.map(p => p.playerName));
        // Auto-build the teams array for the game
        req.body.teams = [validatePlayers(teamPlayers.map(p => p.playerName))];
      }
      if (req.body.handicaps && typeof req.body.handicaps === "object") {
        const clean: Record<string, number> = {};
        for (const [key, val] of Object.entries(req.body.handicaps)) {
          clean[sanitizePlayerName(key)] = val as number;
        }
        req.body.handicaps = clean;
      }
      if (typeof req.body.courseName === "string") {
        req.body.courseName = req.body.courseName.trim().replace(/[\x00-\x1F\x7F<>]/g, "").slice(0, 200);
      }

      const gameData = insertGameSchema.parse(req.body);
      (gameData as any).userId = user.id;
      (gameData as any).sessionId = req.sessionID;
      (gameData as any).tournamentId = req.params.id;

      // Use tournament course if not specified
      if (!gameData.courseName && tournament.courseName) {
        gameData.courseName = tournament.courseName;
      }

      const game = await storage.createGame(gameData);

      // Update tournament player status to "playing"
      await storage.updateTournamentPlayerStatus(req.params.id, user.id, "playing");

      // Also update any other tournament players in this game by name
      const gamePlayers = (gameData.players as string[]) || [];
      for (const gPlayer of gamePlayers) {
        if (gPlayer !== user.name) {
          await storage.updateTournamentPlayerStatusByName(req.params.id, gPlayer, "playing");
        }
      }

      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...tournament },
      });

      res.json(game);
    } catch (error) {
      console.error("Create tournament game error:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create game" });
    }
  });

  // Get tournaments for current user
  app.get("/api/auth/tournaments", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournaments = await storage.getTournamentsByUser(user.id);
      res.json(tournaments);
    } catch (error) {
      console.error("Get user tournaments error:", error);
      res.status(500).json({ message: "Failed to fetch tournaments" });
    }
  });

  // Add player to tournament (creator only — manual add)
  app.post("/api/tournaments/:id/players", async (req, res) => {
    try {
      if (!req.isAuthenticated?.() || !req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = req.user as any;
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.creatorId !== user.id) {
        return res.status(403).json({ message: "Only the tournament creator can add players" });
      }

      const name = typeof req.body.name === "string" ? sanitizePlayerName(req.body.name) : "";
      if (!name || name.length < 1) {
        return res.status(400).json({ message: "Player name is required" });
      }
      if (name.length > 50) {
        return res.status(400).json({ message: "Player name must be 50 characters or less" });
      }

      // Check max players
      if (tournament.maxPlayers) {
        const players = await storage.getTournamentPlayers(req.params.id);
        if (players.length >= tournament.maxPlayers) {
          return res.status(400).json({ message: "Tournament is full" });
        }
      }

      const tp = await storage.addTournamentPlayer(req.params.id, name);
      const players = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...tournament, players },
      });

      res.json(tp);
    } catch (error) {
      console.error("Add tournament player error:", error);
      res.status(500).json({ message: "Failed to add player" });
    }
  });

  // Join tournament as guest (no auth required)
  app.post("/api/tournaments/:id/join-guest", async (req, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ message: "Tournament not found" });
      if (tournament.status === "cancelled" || tournament.status === "complete") {
        return res.status(400).json({ message: "Tournament is no longer accepting players" });
      }

      const name = typeof req.body.name === "string" ? sanitizePlayerName(req.body.name) : "";
      if (!name || name.length < 1) {
        return res.status(400).json({ message: "Player name is required" });
      }
      if (name.length > 50) {
        return res.status(400).json({ message: "Player name must be 50 characters or less" });
      }

      // Check max players
      if (tournament.maxPlayers) {
        const players = await storage.getTournamentPlayers(req.params.id);
        if (players.length >= tournament.maxPlayers) {
          return res.status(400).json({ message: "Tournament is full" });
        }
      }

      const tp = await storage.joinTournament(req.params.id, null, name, true);
      const players = await storage.getTournamentPlayers(req.params.id);
      broadcastToTournament(req.params.id, {
        type: "tournament_updated",
        tournament: { ...tournament, players },
      });

      res.json(tp);
    } catch (error) {
      console.error("Guest join error:", error);
      res.status(500).json({ message: "Failed to join tournament" });
    }
  });

  // Join via invite code — redirect handler
  app.get("/join/:inviteCode", async (req, res) => {
    try {
      const tournament = await storage.getTournamentByInviteCode(req.params.inviteCode);
      if (!tournament) {
        // Redirect to home with error
        return res.redirect("/?error=tournament_not_found");
      }

      // If tournament is cancelled
      if (tournament.status === "cancelled") {
        return res.redirect(`/?error=tournament_cancelled`);
      }

      // If not logged in, redirect to auth with return URL
      if (!req.isAuthenticated?.() || !req.user) {
        // Redirect to tournament page with guest flag so they can join by name
        return res.redirect(`/tournament/${tournament.id}?join=1`);
      }

      const user = req.user as any;

      // Auto-register
      try {
        await storage.joinTournament(tournament.id, user.id, user.name);
      } catch (e) {
        // Already registered, that's fine
      }

      // Redirect to tournament lobby
      res.redirect(`/tournament/${tournament.id}`);
    } catch (error) {
      console.error("Join invite error:", error);
      res.redirect("/?error=join_failed");
    }
  });

  // ── HTTP Server + WebSocket ────────────────────────────────────────────────

  const httpServer = createServer(app);

  // WebSocket
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let currentGameId: string | null = null;
    let currentTournamentId: string | null = null;
    (ws as any)._isAlive = true;

    // ── Heartbeat / keepalive ──────────────────────────────────────────────
    // On each pong, mark alive. The interval below pings and terminates dead sockets.
    ws.on("pong", () => { (ws as any)._isAlive = true; });

    // Application-level ping/pong (works through proxies that strip WS control frames)
    ws.on("message", async (data) => {
      try {
        const message = wsMessageSchema.parse(JSON.parse(data.toString()));

        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (message.type === "pong") {
          (ws as any)._isAlive = true;
          return;
        }

        switch (message.type) {
          case "join_game": {
            if (currentGameId) leaveGame(currentGameId, ws);
            currentGameId = message.gameId;
            joinGame(message.gameId, ws);
            const game = await storage.getGame(message.gameId);
            if (game) ws.send(JSON.stringify({ type: "game_updated", game }));
            break;
          }
          case "update_strokes": {
            if (!currentGameId) break;
            const game = await storage.getGame(currentGameId);
            if (!game) break;
            const currentStrokes = { ...game.strokes };
            if (!currentStrokes[message.playerName]) currentStrokes[message.playerName] = [];
            while (currentStrokes[message.playerName].length < message.hole) currentStrokes[message.playerName].push(0);
            currentStrokes[message.playerName][message.hole - 1] = message.strokes;
            await storage.updateGame(currentGameId, { strokes: currentStrokes });
            const updated = await storage.getGame(currentGameId);
            if (updated) broadcastToGame(currentGameId, { type: "game_updated", game: fixStrokes(updated) });
            break;
          }
          case "complete_hole": {
            if (!currentGameId) break;
            const game = await storage.getGame(currentGameId);
            if (!game) break;
            const newTotalScores = { ...game.totalScores };
            Object.entries(message.holeData.points).forEach(([player, points]) => {
              newTotalScores[player] = (newTotalScores[player] || 0) + (points as number);
            });
            const newWolfCounts = { ...game.wolfCounts };
            const wolfPlayer = message.holeData.metadata?.wolfPlayer as string | undefined;
            if (wolfPlayer) newWolfCounts[wolfPlayer] = (newWolfCounts[wolfPlayer] || 0) + 1;
            const newHoleHistory = [...game.holeHistory, {
              hole: message.holeData.hole,
              strokes: message.holeData.strokes,
              points: message.holeData.points,
              result: message.holeData.result,
              metadata: message.holeData.metadata,
            }];
            // Update strokes array from hole data to prevent gaps
            const updatedStrokes = { ...game.strokes };
            const holeIndex = message.holeData.hole - 1;
            for (const [player, score] of Object.entries(message.holeData.strokes)) {
              if (!updatedStrokes[player]) updatedStrokes[player] = [];
              while (updatedStrokes[player].length <= holeIndex) updatedStrokes[player].push(0);
              updatedStrokes[player][holeIndex] = score as number;
            }
            const isGameComplete = game.currentHole >= 18;
            const updateData: any = {
              currentHole: isGameComplete ? 18 : game.currentHole + 1,
              currentWolfIndex: (game.currentWolfIndex + 1) % game.players.length,
              totalScores: newTotalScores,
              wolfCounts: newWolfCounts,
              holeHistory: newHoleHistory,
              strokes: updatedStrokes,
              active: !isGameComplete,
            };

            await storage.updateGame(currentGameId, updateData);
            const updatedGame = await storage.getGame(currentGameId);
            if (updatedGame) {
              broadcastToGame(currentGameId, { type: "game_updated", game: fixStrokes(updatedGame) });

              // If this game is part of a tournament, broadcast score update
              // and auto-update player status when game completes
              if (updatedGame.tournamentId) {
                if (isGameComplete) {
                  // Mark all players in this game as "finished"
                  const gamePlayers = updatedGame.players as string[];
                  for (const playerName of gamePlayers) {
                    await storage.updateTournamentPlayerStatusByName(updatedGame.tournamentId, playerName, "finished");
                  }
                }
                broadcastTournamentScoreUpdate(updatedGame.tournamentId, updatedGame);
              }
            }
            break;
          }
          case "edit_hole": {
            if (!currentGameId) break;
            const game = await storage.getGame(currentGameId);
            if (!game) break;
            try {
              const edited = recalculateHole(game, message.holeNumber, message.newStrokes);
              const updated = await storage.updateGame(currentGameId, edited);
              if (updated) {
                broadcastToGame(currentGameId, { type: "game_updated", game: fixStrokes(updated) });
                if (updated.tournamentId) {
                  broadcastTournamentScoreUpdate(updated.tournamentId, updated);
                }
              }
            } catch (err) {
              console.error("edit_hole error:", err);
              ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Edit failed" }));
            }
            break;
          }
          case "join_tournament": {
            if (currentTournamentId) leaveTournamentRoom(currentTournamentId, ws);
            currentTournamentId = message.tournamentId;
            joinTournamentRoom(message.tournamentId, ws);
            // Send current tournament state
            const tournament = await storage.getTournament(message.tournamentId);
            if (tournament) {
              const players = await storage.getTournamentPlayers(message.tournamentId);
              ws.send(JSON.stringify({
                type: "tournament_updated",
                tournament: { ...tournament, players },
              }));
            }
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("close", () => {
      if (currentGameId) leaveGame(currentGameId, ws);
      if (currentTournamentId) leaveTournamentRoom(currentTournamentId, ws);
    });
  });

  // ── Server-side keepalive interval ─────────────────────────────────────
  // Ping every 30s. If no pong comes back by next interval, terminate.
  const keepalive = setInterval(() => {
    wss.clients.forEach((ws) => {
      const ext = ws as WebSocket & { _isAlive?: boolean };
      if (ext._isAlive === false) {
        ws.terminate();
        return;
      }
      ext._isAlive = false;
      ws.ping();
      // Also send app-level ping (redundant but survives proxies)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    });
  }, 30_000);

  wss.on("close", () => clearInterval(keepalive));

  function joinGame(gameId: string, ws: WebSocket) {
    if (!gameConnections.has(gameId)) gameConnections.set(gameId, new Set());
    gameConnections.get(gameId)!.add(ws);
  }
  function leaveGame(gameId: string, ws: WebSocket) {
    const conns = gameConnections.get(gameId);
    if (conns) { conns.delete(ws); if (conns.size === 0) gameConnections.delete(gameId); }
  }
  function broadcastToGame(gameId: string, message: any) {
    const conns = gameConnections.get(gameId);
    if (conns) {
      const str = JSON.stringify(message);
      conns.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(str); });
    }
  }

  /**
   * Broadcast a score update to all viewers of a tournament.
   * Sends the full updated leaderboard so the frontend can just swap it in.
   */
  async function broadcastTournamentScoreUpdate(tournamentId: string, game: Game) {
    try {
      const leaderboard = await storage.getTournamentLeaderboard(tournamentId);
      broadcastToTournament(tournamentId, {
        type: "tournament_score_update",
        tournamentId,
        leaderboard,
      });
    } catch (err) {
      console.error("broadcastTournamentScoreUpdate error:", err);
    }
  }

  return httpServer;
}
