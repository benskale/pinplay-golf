import { useState, useEffect, useRef } from "react";
import type { Game, WSMessage } from "@shared/schema";

export function useWebSocket(gameId: string | undefined) {
  const [game, setGame] = useState<Game | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!gameId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      // Join the game room
      ws.send(JSON.stringify({
        type: "join_game",
        gameId,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        
        if (message.type === "game_updated") {
          setGame(message.game);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setIsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [gameId]);

  const sendMessage = (message: Omit<WSMessage, 'type'> & { type: WSMessage['type'] }) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  };

  return {
    game,
    isConnected,
    sendMessage,
  };
}
