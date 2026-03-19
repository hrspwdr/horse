import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DATA_DIR = process.env.DATA_DIR || './data';
const AUDIO_DIR = path.join(DATA_DIR, 'audio');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'horse';

function checkAuth(req, reply) {
  const token = req.cookies?.horse_admin;
  if (token !== 'neigh') {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export default async function adminRoutes(fastify) {
  const { db } = fastify;

  // Auth: login
  fastify.post('/api/admin/login', async (req, reply) => {
    const { password } = req.body || {};
    if (password !== ADMIN_PASSWORD) {
      return reply.code(401).send({ error: 'Wrong password' });
    }
    reply.setCookie('horse_admin', 'neigh', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return { success: true };
  });

  // Auth: check
  fastify.get('/api/admin/check', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    return { authenticated: true };
  });

  // Settings: get
  fastify.get('/api/admin/settings', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;
    return settings;
  });

  // Settings: update
  fastify.put('/api/admin/settings', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const { contributor_name } = req.body || {};
    if (contributor_name !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('contributor_name', contributor_name);
    }
    return { success: true };
  });

  // Chunks: list (with recording info)
  fastify.get('/api/admin/chunks', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const chunks = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM recordings r WHERE r.chunk_id = c.id) as recording_count
      FROM chunks c
      ORDER BY c.display_order ASC
    `).all();

    // Get recordings for each chunk
    const result = chunks.map(chunk => {
      const recordings = db.prepare('SELECT id, contributor_name, audio_path, created_at FROM recordings WHERE chunk_id = ? ORDER BY created_at DESC').all(chunk.id);
      return { ...chunk, recordings };
    });

    return result;
  });

  // Chunks: create
  fastify.post('/api/admin/chunks', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const { text } = req.body || {};
    if (!text) return reply.code(400).send({ error: 'Text is required' });

    const maxOrder = db.prepare('SELECT MAX(display_order) as max_order FROM chunks').get();
    const nextOrder = (maxOrder?.max_order ?? -1) + 1;

    const result = db.prepare('INSERT INTO chunks (text, display_order) VALUES (?, ?)').run(text, nextOrder);
    return { id: result.lastInsertRowid, text, display_order: nextOrder };
  });

  // Chunks: update
  fastify.put('/api/admin/chunks/:id', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const { text, display_order } = req.body || {};

    if (text !== undefined) {
      db.prepare('UPDATE chunks SET text = ? WHERE id = ?').run(text, req.params.id);
    }
    if (display_order !== undefined) {
      db.prepare('UPDATE chunks SET display_order = ? WHERE id = ?').run(display_order, req.params.id);
    }
    return { success: true };
  });

  // Chunks: delete
  fastify.delete('/api/admin/chunks/:id', async (req, reply) => {
    if (!checkAuth(req, reply)) return;

    // Clean up audio files
    const chunk = db.prepare('SELECT reference_audio_path FROM chunks WHERE id = ?').get(req.params.id);
    if (chunk?.reference_audio_path) {
      const refPath = path.join(AUDIO_DIR, 'references', chunk.reference_audio_path);
      if (fs.existsSync(refPath)) fs.unlinkSync(refPath);
    }

    const recordings = db.prepare('SELECT audio_path FROM recordings WHERE chunk_id = ?').all(req.params.id);
    for (const rec of recordings) {
      const recPath = path.join(AUDIO_DIR, 'recordings', rec.audio_path);
      if (fs.existsSync(recPath)) fs.unlinkSync(recPath);
    }

    db.prepare('DELETE FROM chunks WHERE id = ?').run(req.params.id);
    return { success: true };
  });

  // Chunks: upload reference audio
  fastify.post('/api/admin/chunks/:id/reference', async (req, reply) => {
    if (!checkAuth(req, reply)) return;

    const chunk = db.prepare('SELECT id, reference_audio_path FROM chunks WHERE id = ?').get(req.params.id);
    if (!chunk) return reply.code(404).send({ error: 'Chunk not found' });

    // Delete old reference if exists
    if (chunk.reference_audio_path) {
      const oldPath = path.join(AUDIO_DIR, 'references', chunk.reference_audio_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const ext = path.extname(data.filename) || '.webm';
    const filename = `ref_chunk${req.params.id}_${uuidv4()}${ext}`;
    const filePath = path.join(AUDIO_DIR, 'references', filename);

    const writeStream = fs.createWriteStream(filePath);
    await data.file.pipe(writeStream);
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    db.prepare('UPDATE chunks SET reference_audio_path = ? WHERE id = ?').run(filename, req.params.id);
    return { success: true, filename };
  });

  // Recordings: download
  fastify.get('/api/admin/recordings/:id/download', async (req, reply) => {
    if (!checkAuth(req, reply)) return;

    const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
    if (!recording) return reply.code(404).send({ error: 'Recording not found' });

    const filePath = path.join(AUDIO_DIR, 'recordings', recording.audio_path);
    if (!fs.existsSync(filePath)) return reply.code(404).send({ error: 'File not found' });

    reply.header('Content-Disposition', `attachment; filename="${recording.audio_path}"`);
    const mimeType = recording.audio_path.endsWith('.wav') ? 'audio/wav' : 'audio/webm';
    return reply.type(mimeType).sendFile(recording.audio_path, path.join(AUDIO_DIR, 'recordings'));
  });

  // Recordings: delete individual
  fastify.delete('/api/admin/recordings/:id', async (req, reply) => {
    if (!checkAuth(req, reply)) return;

    const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(req.params.id);
    if (!recording) return reply.code(404).send({ error: 'Recording not found' });

    const filePath = path.join(AUDIO_DIR, 'recordings', recording.audio_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.prepare('DELETE FROM recordings WHERE id = ?').run(req.params.id);
    return { success: true };
  });

  // Recordings: download all as zip-like concatenation (individual downloads for simplicity)
  fastify.get('/api/admin/recordings/list', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const recordings = db.prepare(`
      SELECT r.*, c.text as chunk_text
      FROM recordings r
      JOIN chunks c ON r.chunk_id = c.id
      ORDER BY r.contributor_name, c.display_order
    `).all();
    return recordings;
  });

  // Chunks: reorder
  fastify.post('/api/admin/chunks/reorder', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    const { order } = req.body || {}; // array of chunk IDs in desired order
    if (!Array.isArray(order)) return reply.code(400).send({ error: 'Order must be an array' });

    const stmt = db.prepare('UPDATE chunks SET display_order = ? WHERE id = ?');
    const transaction = db.transaction((ids) => {
      ids.forEach((id, index) => stmt.run(index, id));
    });
    transaction(order);
    return { success: true };
  });
}
