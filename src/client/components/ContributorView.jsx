import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from './Waveform.jsx';
import AsciiHorse from './AsciiHorse.jsx';

const STATES = {
  LOADING: 'loading',
  IDENTIFY: 'identify',
  WELCOME: 'welcome',
  READY: 'ready',
  RECORDING: 'recording',
  REVIEW: 'review',
  UPLOADING: 'uploading',
  COMPLETE: 'complete',
};

// ── Translations ──

const T = {
  en: {
    identify: 'IDENTIFY YOURSELF, PLEASE',
    identifyPlaceholder: 'Your name',
    identifyContinue: 'CONTINUE',
    welcome: (name) => `Welcome, ${name}`,
    lineCount: (n) => `You have ${n} line${n !== 1 ? 's' : ''} to record.`,
    begin: 'BEGIN',
    hearReference: 'HEAR REFERENCE',
    hearingReference: '...',
    record: 'RECORD',
    stop: 'STOP',
    recordingNow: 'RECORDING NOW',
    retake: 'RETAKE',
    submitNext: 'SUBMIT & NEXT',
    submitFinal: 'SUBMIT FINAL',
    transmitting: 'TRANSMITTING...',
    complete: 'YOU HAVE SUCCESSFULLY BEEN A PART OF THE TEAM.',
    micRequired: 'Microphone access is required.',
    loadFailed: 'Failed to load session.',
    uploadFailed: 'Upload failed. Please try again.',
  },
  fr: {
    identify: 'IDENTIFIEZ-VOUS, S.V.P.',
    identifyPlaceholder: 'Votre nom',
    identifyContinue: 'CONTINUER',
    welcome: (name) => `Bienvenue, ${name}`,
    lineCount: (n) => `Vous avez ${n} ligne${n !== 1 ? 's' : ''} \u00e0 enregistrer.`,
    begin: 'COMMENCER',
    hearReference: '\u00c9COUTER LA R\u00c9F\u00c9RENCE',
    hearingReference: '...',
    record: 'ENREGISTRER',
    stop: 'ARR\u00caTER',
    recordingNow: 'ENREGISTREMENT EN COURS',
    retake: 'REPRENDRE',
    submitNext: 'SOUMETTRE & SUIVANT',
    submitFinal: 'SOUMETTRE (FINAL)',
    transmitting: 'TRANSMISSION...',
    complete: 'VOUS AVEZ FAIT PARTIE DE L\u2019\u00c9QUIPE AVEC SUCC\u00c8S.',
    micRequired: 'L\u2019acc\u00e8s au micro est requis.',
    loadFailed: '\u00c9chec du chargement.',
    uploadFailed: '\u00c9chec du t\u00e9l\u00e9versement. Veuillez r\u00e9essayer.',
  },
};

// ── Audio format detection ──

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function getFileExtension(mimeType) {
  if (mimeType.includes('mp4')) return '.mp4';
  if (mimeType.includes('ogg')) return '.ogg';
  return '.webm';
}

// ── Component ──

export default function ContributorView() {
  const [state, setState] = useState(STATES.LOADING);
  const [session, setSession] = useState(null);
  const [contributorName, setContributorName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const [playingReference, setPlayingReference] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const streamRef = useRef(null);
  const referenceAudioRef = useRef(null);
  const mimeTypeRef = useRef('');

  const lang = session?.language || 'en';
  const t = T[lang] || T.en;

  // Fetch session data
  useEffect(() => {
    fetch('/api/session')
      .then(r => r.json())
      .then(data => {
        setSession(data);
        if (data.idMode === 'self') {
          setState(STATES.IDENTIFY);
        } else {
          setContributorName(data.contributorName || 'Friend');
          setState(STATES.WELCOME);
        }
      })
      .catch(() => setError(t.loadFailed));
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const currentChunk = session?.chunks?.[currentIndex];

  const getFreshStream = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000,
        channelCount: 1,
      },
    });
    streamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 48000 });
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;
    audioContextRef.current = audioContext;

    return stream;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await getFreshStream();

      chunksRef.current = [];
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const recorderOptions = { audioBitsPerSecond: 256000 };
      if (mimeType) recorderOptions.mimeType = mimeType;

      const recorder = new MediaRecorder(stream, recorderOptions);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState(STATES.REVIEW);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState(STATES.RECORDING);
    } catch {
      setError(t.micRequired);
    }
  }, [getFreshStream, t]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const retake = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setState(STATES.READY);
  }, [audioUrl]);

  const submitAndNext = useCallback(async () => {
    if (!audioBlob || !currentChunk) return;
    setState(STATES.UPLOADING);

    const ext = getFileExtension(mimeTypeRef.current);
    const formData = new FormData();
    formData.append('audio', audioBlob, `recording${ext}`);

    // Pass contributor name as query param in self-ID mode
    const params = session?.idMode === 'self'
      ? `?contributor=${encodeURIComponent(contributorName)}`
      : '';

    try {
      await fetch(`/api/chunks/${currentChunk.id}/recording${params}`, {
        method: 'POST',
        body: formData,
      });

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);

      if (currentIndex + 1 >= session.chunks.length) {
        setState(STATES.COMPLETE);
      } else {
        setCurrentIndex(prev => prev + 1);
        setState(STATES.READY);
      }
    } catch {
      setError(t.uploadFailed);
      setState(STATES.REVIEW);
    }
  }, [audioBlob, audioUrl, currentChunk, currentIndex, session, contributorName, t]);

  const playReference = useCallback(() => {
    if (!currentChunk?.hasReference) return;
    if (referenceAudioRef.current) {
      referenceAudioRef.current.pause();
      referenceAudioRef.current = null;
    }
    const audio = new Audio(`/api/chunks/${currentChunk.id}/reference`);
    audio.onplay = () => setPlayingReference(true);
    audio.onended = () => setPlayingReference(false);
    audio.onerror = () => setPlayingReference(false);
    referenceAudioRef.current = audio;
    audio.play();
  }, [currentChunk]);

  const submitIdentity = useCallback((e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setContributorName(nameInput.trim());
    setState(STATES.WELCOME);
  }, [nameInput]);

  const beginSession = useCallback(() => {
    setState(STATES.READY);
  }, []);

  // ── RENDER ──

  if (error) {
    return (
      <div className="container">
        <div className="error-text">{error}</div>
      </div>
    );
  }

  if (state === STATES.LOADING) {
    return (
      <div className="container">
        <div className="loading-pulse" />
      </div>
    );
  }

  if (state === STATES.IDENTIFY) {
    return (
      <div className="container">
        <form className="identify-screen" onSubmit={submitIdentity}>
          <div className="identify-prompt">{t.identify}</div>
          <input
            type="text"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            className="identify-input"
            placeholder={t.identifyPlaceholder}
            autoFocus
          />
          <button type="submit" className="btn btn-primary">
            {t.identifyContinue}
          </button>
        </form>
      </div>
    );
  }

  if (state === STATES.WELCOME) {
    return (
      <div className="container">
        <div className="welcome-screen">
          <h1 className="welcome-name">
            {t.welcome(contributorName)}
          </h1>
          <p className="welcome-sub">
            {t.lineCount(session.chunks.length)}
          </p>
          <button className="btn btn-primary" onClick={beginSession}>
            {t.begin}
          </button>
        </div>
      </div>
    );
  }

  if (state === STATES.COMPLETE) {
    return (
      <div className="container">
        <div className="complete-screen">
          <AsciiHorse />
          <div className="complete-text">
            {t.complete}
          </div>
        </div>
      </div>
    );
  }

  // Recording flow states
  const progress = `${currentIndex + 1} / ${session.chunks.length}`;

  return (
    <div className="container">
      <div className="progress-indicator">{progress}</div>

      <div className="chunk-text-container">
        <p className="chunk-text">{currentChunk?.text}</p>
      </div>

      {currentChunk?.hasReference && (
        <button
          className={`btn btn-reference ${playingReference ? 'playing' : ''}`}
          onClick={playReference}
          disabled={state === STATES.RECORDING}
        >
          {playingReference ? t.hearingReference : t.hearReference}
        </button>
      )}

      {state === STATES.RECORDING && (
        <div className="recording-indicator">
          <Waveform analyser={analyserRef.current} />
          <div className="recording-now">{t.recordingNow}</div>
        </div>
      )}

      <div className="controls">
        {state === STATES.READY && (
          <button className="btn btn-record" onClick={startRecording}>
            {t.record}
          </button>
        )}

        {state === STATES.RECORDING && (
          <button className="btn btn-stop" onClick={stopRecording}>
            {t.stop}
          </button>
        )}

        {state === STATES.REVIEW && (
          <>
            <audio src={audioUrl} controls className="playback" />
            <div className="review-controls">
              <button className="btn btn-secondary" onClick={retake}>
                {t.retake}
              </button>
              <button className="btn btn-primary" onClick={submitAndNext}>
                {currentIndex + 1 >= session.chunks.length ? t.submitFinal : t.submitNext}
              </button>
            </div>
          </>
        )}

        {state === STATES.UPLOADING && (
          <div className="uploading-text">{t.transmitting}</div>
        )}
      </div>
    </div>
  );
}
