import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR || './data';
const AUDIO_DIR = path.join(DATA_DIR, 'audio');

// Ensure audio directories exist
fs.mkdirSync(path.join(AUDIO_DIR, 'references'), { recursive: true });
fs.mkdirSync(path.join(AUDIO_DIR, 'recordings'), { recursive: true });

export default async function apiRoutes(fastify) {
  const { db } = fastify;

  const getSetting = (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value;
  };

  // Public: get current session info (contributor name + chunks + settings)
  fastify.get('/api/session', async () => {
    const chunks = db.prepare('SELECT id, text, display_order, reference_audio_path FROM chunks ORDER BY display_order ASC').all();
    const idMode = getSetting('id_mode') || 'admin';
    const language = getSetting('language') || 'en';

    const result = {
      idMode,
      language,
      chunks: chunks.map(c => ({
        id: c.id,
        text: c.text,
        order: c.display_order,
        hasReference: !!c.reference_audio_path,
      })),
    };

    // Only include the admin-set name if in admin mode
    if (idMode === 'admin') {
      result.contributorName = getSetting('contributor_name') || 'Friend';
    }

    return result;
  });

  // Public: get reference audio for a chunk
  fastify.get('/api/chunks/:id/reference', async (req, reply) => {
    const chunk = db.prepare('SELECT reference_audio_path FROM chunks WHERE id = ?').get(req.params.id);
    if (!chunk?.reference_audio_path) {
      return reply.code(404).send({ error: 'No reference audio' });
    }
    const filePath = path.join(AUDIO_DIR, 'references', chunk.reference_audio_path);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: 'File not found' });
    }
    return reply.type('audio/webm').sendFile(chunk.reference_audio_path, path.join(AUDIO_DIR, 'references'));
  });

  // Public: upload a recording for a chunk
  fastify.post('/api/chunks/:id/recording', async (req, reply) => {
    const chunk = db.prepare('SELECT id FROM chunks WHERE id = ?').get(req.params.id);
    if (!chunk) {
      return reply.code(404).send({ error: 'Chunk not found' });
    }

    // Get contributor name from query param (self-ID mode) or settings (admin mode)
    const idMode = getSetting('id_mode') || 'admin';
    let contributorName;
    if (idMode === 'self' && req.query.contributor) {
      contributorName = req.query.contributor;
    } else {
      contributorName = getSetting('contributor_name') || 'Unknown';
    }

    const data = await req.file();
    if (!data) {
      return reply.code(400).send({ error: 'No audio file provided' });
    }

    const baseName = `${contributorName.replace(/[^a-zA-Z0-9]/g, '_')}_chunk${req.params.id}_${uuidv4()}`;
    const srcExt = path.extname(data.filename) || '.webm';
    const srcPath = path.join(AUDIO_DIR, 'recordings', `${baseName}${srcExt}`);
    const wavFilename = `${baseName}.wav`;
    const wavPath = path.join(AUDIO_DIR, 'recordings', wavFilename);

    // Save the incoming audio (webm from Chrome, mp4 from Safari, etc.)
    const writeStream = fs.createWriteStream(srcPath);
    await data.file.pipe(writeStream);
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Convert to wav (16-bit PCM, 48kHz) — ffmpeg handles all input formats
    try {
      await execFileAsync('ffmpeg', [
        '-i', srcPath,
        '-ar', '48000',
        '-ac', '1',
        '-sample_fmt', 's16',
        '-y',
        wavPath,
      ]);
      fs.unlinkSync(srcPath);
    } catch (err) {
      fastify.log.error('ffmpeg conversion failed:', err.message);
      fs.renameSync(srcPath, wavPath);
    }

    // Delete any previous recording for this chunk + contributor
    const oldRecordings = db.prepare('SELECT audio_path FROM recordings WHERE chunk_id = ? AND contributor_name = ?').all(req.params.id, contributorName);
    for (const old of oldRecordings) {
      const oldPath = path.join(AUDIO_DIR, 'recordings', old.audio_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    db.prepare('DELETE FROM recordings WHERE chunk_id = ? AND contributor_name = ?').run(req.params.id, contributorName);

    db.prepare('INSERT INTO recordings (chunk_id, contributor_name, audio_path) VALUES (?, ?, ?)').run(req.params.id, contributorName, wavFilename);

    return { success: true, filename: wavFilename };
  });
}
