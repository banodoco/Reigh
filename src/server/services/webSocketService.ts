import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer;

export function initializeWebSocketServer(server: Server): void {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WebSocket] Client connected');

    ws.on('message', (message: string) => {
      console.log(`[WebSocket] Received message: ${message}`);
      // Echo message back to client
      ws.send(`Echo: ${message}`);
    });

    ws.on('close', () => {
      console.log('[WebSocket] Client disconnected');
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });

  console.log('[WebSocket] Server initialized');
}

export const broadcast = (message: object) => {
  if (!wss) {
    console.error('[WebSocket] WebSocket server not initialized. Cannot broadcast message.');
    return;
  }

  const messageString = JSON.stringify(message);
  // console.log(`[WebSocket] Broadcasting message to all clients: ${messageString}`);
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
} 