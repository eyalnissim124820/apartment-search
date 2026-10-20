import { createApp } from '../server/app.js';

// Vercel Function: every /api/* request is rewritten here (see vercel.json).
const { app } = createApp();

export default app;
