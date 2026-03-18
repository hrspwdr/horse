import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from './db.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || './data';
const PORT = process.env.PORT || 3000;

// Ensure data directories exist
fs.mkdirSync(path.join(DATA_DIR, 'audio', 'references'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'audio', 'recordings'), { recursive: true });

const fastify = Fastify({ logger: true });

// Decorate with db
fastify.decorate('db', db);

// Plugins
await fastify.register(fastifyCookie);
await fastify.register(fastifyCors, { origin: true, credentials: true });
await fastify.register(fastifyMultipart, {
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// API routes
await fastify.register(apiRoutes);
await fastify.register(adminRoutes);

// Serve built client in production
const clientDist = path.join(__dirname, '../../dist/client');
if (fs.existsSync(clientDist)) {
  await fastify.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback — serve index.html for all non-API routes
  fastify.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      reply.sendFile('index.html');
    }
  });
}

// Graceful shutdown
const shutdown = async () => {
  fastify.log.info('Shutting down...');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  await fastify.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
