import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertGameSchema, updateGameSchema, wsMessageSchema, validatePlayers, sanitizePlayerName } from "@shared/schema";
import type { Game } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";

const gameConnections = new Map<string, Set<WebSocket>>();

const GOLF_API_BASE = "https://api.opengolfapi.org/v1";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes (passport init happens inside)
  setupAuth(app);

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

  // Golf course search
  app.get("/api/courses/search", async (req, res) => {
    try {
      const q = (req.query.q as string || "").trim();
      if (!q || q.length < 2) return res.json({ courses: [] });
      const data = await fetchGolfApi(`/courses/search?q=${encodeURIComponent(q)}&limit=8`);
      const courses = (data.courses || []).map((c: any) => ({
        id: c.id,
        name: c.course_name || c.club_name,
        city: c.city,
        state: c.state,
        par: c.par_total,
        holes: c.holes_count,
      }));
      res.json({ courses });
    } catch {
      res.json({ courses: [] });
    }
  });

  // Golf course detail
  app.get("/api/courses/:id", async (req, res) => {
    try {
      const data = await fetchGolfApi(`/courses/${req.params.id}`);
      const pars: number[] = [];
      const hcpRanks: number[] = [];
      if (Array.isArray(data.scorecard) && data.scorecard.length > 0) {
        const sorted = [...data.scorecard].sort((a: any, b: any) => a.hole_number - b.hole_number);
        sorted.forEach((h: any, idx: number) => {
          pars.push(h.par || 4);
          if (idx === 0) console.log("[CourseAPI] sample hole fields:", JSON.stringify(h));
          const rank = h.handicap ?? h.stroke_index ?? h.hcp ?? h.handicap_index ?? h.strokeIndex ?? h.si ?? h.difficulty ?? null;
          hcpRanks.push(rank);
        });
      }
      while (pars.length < 18) pars.push(4);
      while (hcpRanks.length < 18) hcpRanks.push(null as any);
      const validHcpRanks = hcpRanks.length === 18 && hcpRanks.every(r => typeof r === "number" && r >= 1 && r <= 18) ? hcpRanks : null;
      res.json({ id: data.id, name: data.course_name || data.club_name, city: data.city, state: data.state, par: data.par_total, pars: pars.slice(0, 18), hcpRanks: validHcpRanks });
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
      res.json(fixStrokes(updated));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to edit hole" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws) => {
    let currentGameId: string | null = null;

    ws.on("message", async (data) => {
      try {
        const message = wsMessageSchema.parse(JSON.parse(data.toString()));

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
            await storage.updateGame(currentGameId, {
              currentHole: isGameComplete ? 18 : game.currentHole + 1,
              currentWolfIndex: (game.currentWolfIndex + 1) % game.players.length,
              totalScores: newTotalScores,
              wolfCounts: newWolfCounts,
              holeHistory: newHoleHistory,
              strokes: updatedStrokes,
              active: !isGameComplete,
            });
            const updatedGame = await storage.getGame(currentGameId);
            if (updatedGame) broadcastToGame(currentGameId, { type: "game_updated", game: fixStrokes(updatedGame) });
            break;
          }
          case "edit_hole": {
            if (!currentGameId) break;
            const game = await storage.getGame(currentGameId);
            if (!game) break;
            try {
              const edited = recalculateHole(game, message.holeNumber, message.newStrokes);
              const updated = await storage.updateGame(currentGameId, edited);
              if (updated) broadcastToGame(currentGameId, { type: "game_updated", game: fixStrokes(updated) });
            } catch (err) {
              console.error("edit_hole error:", err);
              ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Edit failed" }));
            }
            break;
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
      }
    });

    ws.on("close", () => { if (currentGameId) leaveGame(currentGameId, ws); });
  });

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

  return httpServer;
}
