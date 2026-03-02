/**
 * Vercel serverless entry point.
 * Routes all requests to the Express app so /apps/booxi/* and /health work.
 */
import app from '../server.js';

export default app;
