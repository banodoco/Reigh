process.on('unhandledRejection', (reason, promise) => {
  console.error('[GLOBAL] Unhandled Rejection at:', promise, 'reason:', reason);
  // Optionally, exit the process or add more detailed logging
  // process.exit(1); // Be cautious with this in production
});

process.on('uncaughtException', (error) => {
  console.error('[GLOBAL] Uncaught Exception:', error);
  // Optionally, exit the process
  // process.exit(1); // Be cautious with this in production
});

import express from 'express';
import cors from 'cors';
import projectsRouter from './routes/projects';
import shotsRouter from './routes/shots';
import generationsRouter from './routes/generations';
import tasksRouter from './routes/tasks';
import steerableMotionRouter from './routes/steerableMotion';
import resourcesRouter from './routes/resources';
import apiKeysRouter from './routes/apiKeys';
import creditsRouter from './routes/credits';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { startTaskPoller, startTaskStatusPoller } from './services/taskProcessingService';
import { initializeWebSocketServer } from './services/webSocketService';
import http from 'http';
import { seedDatabase } from '../lib/seed';
import singleImageRouter from './routes/singleImageGeneration';
// import { fileURLToPath } from 'url'; // No longer needed if using process.cwd()

// // Determine __dirname for ES modules
// const __filename = fileURLToPath(import.meta.url); // No longer needed
// const __dirname = path.dirname(__filename); // No longer needed

dotenv.config();

const app = express();
// Use process.env.PORT for flexibility, e.g., when deploying.
// Default to 3001 for local development if PORT is not set.
const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 8085;

// Middleware
app.use(cors()); // Basic CORS setup, configure as needed for production
app.use(express.json()); // To parse JSON request bodies

// API Routes
app.use('/api/projects', projectsRouter);
app.use('/api/shots', shotsRouter);
app.use('/api/generations', generationsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/steerable-motion', steerableMotionRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/api-keys', apiKeysRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/single-image', singleImageRouter);

const startServer = async () => {
  try {
    // Only seed the database in development mode
    if (process.env.NODE_ENV === 'development') {
      await seedDatabase();
    }

    // Bind to all network interfaces to allow mobile/LAN access
    // In production, this should be properly secured with firewall rules
    const HOST = process.env.HOST || '0.0.0.0';

    // The existing server initialization logic
    const server = app.listen(PORT, HOST, () => {
      console.log(`API Server listening on ${HOST}:${PORT}`);
      console.log(`For mobile access: Use your computer's IP address (e.g., 192.168.1.100:${PORT})`);
      console.log(`Local access: http://localhost:${PORT} or http://127.0.0.1:${PORT}`);
      initializeWebSocketServer();
      startTaskPoller(); // Start the background task poller
      startTaskStatusPoller(); // Start the task status poller
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

// Global error handling middleware - MUST be defined after all other app.use() and routes
 
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]', err);
  
  // If the error is an object and has a status, use it, otherwise default to 500
  const statusCode = typeof err.status === 'number' ? err.status : 500;
  
  // Send a generic message or the error message if available
  const message = err.message || 'An unexpected error occurred on the server.';
  
  res.status(statusCode).json({ message });
});

// Export the app for potential testing or other uses (optional)
export default app; 