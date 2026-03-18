import React, { useState, useEffect, useCallback } from 'react';

export default function AdminView() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [contributorName, setContributorName] = useState('');
  const [chunks, setChunks] = useState([]);
  const [newChunkText, setNewChunkText] = useState('');
  const [recordings, setRecordings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Check existing auth
  useEffect(() => {
    fetch('/api/admin/check').then(r => {
      if (r.ok) setAuthenticated(true);
    });
  }, []);

  const login = async (e) => {
    e.preventDefault();
    setAuthError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthenticated(true);
    } else {
      setAuthError('Wrong password.');
    }
  };

  const loadData = useCallback(async () => {
    const [settingsRes, chunksRes, recordingsRes] = await Promise.all([
      fetch('/api/admin/settings'),
      fetch('/api/admin/chunks'),
      fetch('/api/admin/recordings/list'),
    ]);
    const settings = await settingsRes.json();
    const chunksData = await chunksRes.json();
    const recordingsData = await recordingsRes.json();

    setContributorName(settings.contributor_name || '');
    setChunks(chunksData);
    setRecordings(recordingsData);
  }, []);

  useEffect(() => {
    if (authenticated) loadData();
  }, [authenticated, loadData]);

  const flash = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2000);
  };

  const saveName = async () => {
    setSaving(true);
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributor_name: contributorName }),
    });
    setSaving(false);
    flash('Saved.');
  };

  const addChunk = async () => {
    if (!newChunkText.trim()) return;
    await fetch('/api/admin/chunks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newChunkText.trim() }),
    });
    setNewChunkText('');
    loadData();
    flash('Chunk added.');
  };

  const deleteChunk = async (id) => {
    if (!confirm('Delete this chunk and its recordings?')) return;
    await fetch(`/api/admin/chunks/${id}`, { method: 'DELETE' });
    loadData();
    flash('Deleted.');
  };

  const updateChunkText = async (id, text) => {
    await fetch(`/api/admin/chunks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    flash('Updated.');
  };

  const uploadReference = async (chunkId, file) => {
    const formData = new FormData();
    formData.append('audio', file);
    await fetch(`/api/admin/chunks/${chunkId}/reference`, {
      method: 'POST',
      body: formData,
    });
    loadData();
    flash('Reference uploaded.');
  };

  const moveChunk = async (index, direction) => {
    const newChunks = [...chunks];
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= newChunks.length) return;
    [newChunks[index], newChunks[swapIndex]] = [newChunks[swapIndex], newChunks[index]];
    const order = newChunks.map(c => c.id);
    await fetch('/api/admin/chunks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
    loadData();
  };

  // ── LOGIN GATE ──
  if (!authenticated) {
    return (
      <div className="container admin-container">
        <form onSubmit={login} className="admin-login">
          <h2 className="admin-title">ADMIN</h2>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="admin-input"
            autoFocus
          />
          <button type="submit" className="btn btn-primary">ENTER</button>
          {authError && <div className="error-text">{authError}</div>}
        </form>
      </div>
    );
  }

  // ── ADMIN PANEL ──
  return (
    <div className="container admin-container">
      <h1 className="admin-title">HORSE ADMIN</h1>
      {message && <div className="admin-flash">{message}</div>}

      {/* Contributor Name */}
      <section className="admin-section">
        <h2 className="admin-section-title">Current Contributor</h2>
        <div className="admin-row">
          <input
            type="text"
            value={contributorName}
            onChange={e => setContributorName(e.target.value)}
            className="admin-input"
            placeholder="Contributor name"
          />
          <button className="btn btn-primary" onClick={saveName} disabled={saving}>
            {saving ? '...' : 'SAVE'}
          </button>
        </div>
        <p className="admin-hint">
          This name appears on the welcome screen. Change it before each contributor records.
        </p>
      </section>

      {/* Text Chunks */}
      <section className="admin-section">
        <h2 className="admin-section-title">Text Chunks ({chunks.length})</h2>

        {chunks.map((chunk, i) => (
          <div key={chunk.id} className="admin-chunk">
            <div className="admin-chunk-header">
              <span className="admin-chunk-number">#{i + 1}</span>
              <div className="admin-chunk-actions">
                <button className="btn-icon" onClick={() => moveChunk(i, -1)} disabled={i === 0} title="Move up">&#9650;</button>
                <button className="btn-icon" onClick={() => moveChunk(i, 1)} disabled={i === chunks.length - 1} title="Move down">&#9660;</button>
                <button className="btn-icon btn-danger" onClick={() => deleteChunk(chunk.id)} title="Delete">&#10005;</button>
              </div>
            </div>
            <textarea
              defaultValue={chunk.text}
              className="admin-textarea"
              rows={2}
              onBlur={e => {
                if (e.target.value !== chunk.text) updateChunkText(chunk.id, e.target.value);
              }}
            />
            <div className="admin-chunk-meta">
              <label className="admin-file-label">
                {chunk.reference_audio_path ? 'Replace reference' : 'Upload reference'}
                <input
                  type="file"
                  accept="audio/*"
                  className="admin-file-input"
                  onChange={e => {
                    if (e.target.files[0]) uploadReference(chunk.id, e.target.files[0]);
                  }}
                />
              </label>
              {chunk.reference_audio_path && <span className="admin-badge">Has reference</span>}
              {chunk.recording_count > 0 && (
                <span className="admin-badge">{chunk.recording_count} recording{chunk.recording_count > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        ))}

        <div className="admin-add-chunk">
          <textarea
            value={newChunkText}
            onChange={e => setNewChunkText(e.target.value)}
            className="admin-textarea"
            rows={2}
            placeholder="Enter text for new chunk..."
          />
          <button className="btn btn-primary" onClick={addChunk}>ADD CHUNK</button>
        </div>
      </section>

      {/* Recordings */}
      <section className="admin-section">
        <h2 className="admin-section-title">Recordings ({recordings.length})</h2>
        {recordings.length === 0 && <p className="admin-hint">No recordings yet.</p>}
        {recordings.map(rec => (
          <div key={rec.id} className="admin-recording">
            <div className="admin-recording-info">
              <span className="admin-recording-name">{rec.contributor_name}</span>
              <span className="admin-recording-chunk">"{rec.chunk_text?.slice(0, 50)}..."</span>
              <span className="admin-recording-date">{new Date(rec.created_at).toLocaleString()}</span>
            </div>
            <a
              href={`/api/admin/recordings/${rec.id}/download`}
              className="btn btn-small"
              download
            >
              DOWNLOAD
            </a>
          </div>
        ))}
      </section>
    </div>
  );
}
