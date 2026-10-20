import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { startViewingReminders } from './push.js';

// Long-running server for local dev / self-hosting. On Vercel, api/index.ts is used instead.
const { app, store, push } = createApp();

// Serve the built client in production.
const dist = path.resolve('dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

startViewingReminders(store, push);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
