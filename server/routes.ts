import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertGameSchema, updateGameSchema, wsMessageSchema } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";

const gameConnections = new Map<string, Set<WebSocket>>();

const GOLF_API_BASE = "https://api.opengolfapi.org/v1";

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
      res.json(game);
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
            if (updated) broadcastToGame(currentGameId, { type: "game_updated", game: updated });
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
            const isGameComplete = game.currentHole >= 18;
            await storage.updateGame(currentGameId, {
              currentHole: isGameComplete ? 18 : game.currentHole + 1,
              currentWolfIndex: (game.currentWolfIndex + 1) % game.players.length,
              totalScores: newTotalScores,
              wolfCounts: newWolfCounts,
              holeHistory: newHoleHistory,
              active: !isGameComplete,
            });
            const updatedGame = await storage.getGame(currentGameId);
            if (updatedGame) broadcastToGame(currentGameId, { type: "game_updated", game: updatedGame });
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
