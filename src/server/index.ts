process.on('unhandledRejection', (reason, promise) => {
  console.error('[GLOBAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[GLOBAL] Uncaught Exception:', error);
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { startTaskPoller, startTaskStatusPoller } from './services/taskProcessingService';
import { initializeWebSocketServer } from './services/webSocketService';

dotenv.config();

const app = express();
const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 8085;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'WebSocket and Task Processing Server', 
    timestamp: new Date().toISOString() 
  });
});

const startServer = async () => {
  try {
    // Bind to all network interfaces to allow mobile/LAN access
    const HOST = process.env.HOST || '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      console.log(`WebSocket & Task Processing Server listening on ${HOST}:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`For mobile access: Use your computer's IP address (e.g., 192.168.1.100:${PORT})`);
      
      // Initialize core services
      initializeWebSocketServer();
      startTaskPoller();
      startTaskStatusPoller();
      
      console.log('✅ Real-time updates and task polling services started');
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// Global error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]', err);
  const statusCode = typeof err.status === 'number' ? err.status : 500;
  const message = err.message || 'An unexpected error occurred on the server.';
  res.status(statusCode).json({ message });
});

export default app; 