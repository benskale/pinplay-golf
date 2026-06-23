import { useState, useEffect, useRef, useCallback } from "react";
import type { Game, WSMessage } from "@shared/schema";

const MAX_RECONNECT_ATTEMPTS = 20;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 25_000;   // Send ping every 25s
const HEARTBEAT_TIMEOUT_MS = 15_000;     // If no pong in 15s, force reconnect

export function useWebSocket(gameId: string | undefined) {
  const [game, setGame] = useState<Game | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gameIdRef = useRef(gameId);
  const aliveRef = useRef(true);

  // Keep gameId ref in sync
  useEffect(() => {
    gameIdRef.current = gameId;
  }, [gameId]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const currentGameId = gameIdRef.current;
    if (!currentGameId) return;

    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    clearHeartbeat();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    aliveRef.current = true;

    ws.onopen = () => {
      setIsConnected(true);
      attemptRef.current = 0;
      // Join the game room
      ws.send(
        JSON.stringify({
          type: "join_game",
          gameId: currentGameId,
        })
      );

      // ── Start client heartbeat ──────────────────────────────────────────
      clearHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        // Set a timeout: if server doesn't respond, force reconnect
        heartbeatTimeoutRef.current = setTimeout(() => {
          if (aliveRef.current === false) {
            console.warn("[WS] heartbeat timeout - server unresponsive, reconnecting");
            // Force close to trigger reconnect
            try { wsRef.current?.close(4000, "heartbeat timeout"); } catch {}
          }
        }, HEARTBEAT_TIMEOUT_MS);

        aliveRef.current = false;
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        // Handle heartbeat responses
        if (message.type === "pong") {
          aliveRef.current = true;
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          return;
        }

        if (message.type === "ping") {
          // Server-initiated heartbeat - respond immediately
          wsRef.current?.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (message.type === "game_updated") {
          setGame(message.game);
        }
      } catch (error) {
        console.error("[WS] parse error:", error);
      }
    };

    ws.onclose = (event) => {
      setIsConnected(false);
      wsRef.current = null;
      clearHeartbeat();

      // Don't reconnect if code 1000 (normal) or 1001 (going away) or component unmounted
      if (event.code === 1000 || event.code === 1001) return;
      if (!gameIdRef.current) return;

      // Exponential backoff reconnect
      const attempt = attemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[WS] max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
        return;
      }

      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500, MAX_DELAY_MS);
      attemptRef.current += 1;

      console.log(`[WS] reconnecting in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = (error) => {
      console.error("[WS] error:", error);
      // onclose will fire after onerror, which handles reconnect
    };
  }, [clearHeartbeat]);

  // Main effect: connect when gameId changes, clean up on unmount
  useEffect(() => {
    if (!gameId) return;

    attemptRef.current = 0;
    connect();

    return () => {
      // Clear any pending reconnect
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      clearHeartbeat();
      // Clear gameId so onclose doesn't trigger reconnect after unmount
      gameIdRef.current = undefined;

      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close
        wsRef.current.close(1000, "component unmount");
        wsRef.current = null;
      }
    };
  }, [gameId, connect, clearHeartbeat]);

  const sendMessage = useCallback(
    (message: Omit<WSMessage, "type"> & { type: WSMessage["type"] }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      } else {
        console.warn("[WS] attempted to send while not connected");
      }
    },
    []
  );

  return {
    game,
    isConnected,
    sendMessage,
  };
}
