import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { apiRouter } from './server/routes/journal.ts';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Null-safe body parser middleware mounted BEFORE any route registration (Directive 6)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AegisJournal', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api', apiRouter);

// Serve static frontend files in production
const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start server listening on port 3000
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AegisJournal] Server listening on http://0.0.0.0:${PORT}`);
});
