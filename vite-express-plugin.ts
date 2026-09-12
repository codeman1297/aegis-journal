import type { Plugin } from 'vite';
import { apiRouter } from './server/routes/journal.ts';
import express from 'express';

export function expressApiPlugin(): Plugin {
  return {
    name: 'express-api-plugin',
    configureServer(server) {
      // Create express app for API routes inside Vite dev server
      const app = express();
      app.use(express.json({ limit: '2mb' }));
      app.use(express.urlencoded({ extended: true }));

      // Attach API router
      app.use('/api', apiRouter);

      // Mount into Vite dev server connect middlewares
      server.middlewares.use(app);
    },
  };
}
