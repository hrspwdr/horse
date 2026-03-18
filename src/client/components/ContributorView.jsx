import React, { useState, useEffect, useRef, useCallback } from 'react';
import Waveform from './Waveform.jsx';
import AsciiHorse from './AsciiHorse.jsx';

const STATES = {
  LOADING: 'loading',
  WELCOME: 'welcome',
  READY: 'ready',
  RECORDING: 'recording',
  REVIEW: 'review',
  UPLOADING: 'uploading',
  COMPLETE: 'complete',
};

export default function ContributorView() {
  const [state, setState] = useState(STATES.LOADING);
  const [session, setSession] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState(null);
  const [playingReference, setPlayingReference] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const referenceAudioRef = useRef(null);

  // Fetch session data
  useEffect(() => {
    fetch('/api/session')
      .then(r => r.json())
      .then(data => {
        setSession(data);
        setState(STATES.WELCOME);
      })
      .catch(() => setError('Failed to load session.'));
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const currentChunk = session?.chunks?.[currentIndex];

  const initMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      return stream;
    } catch {
      setError('Microphone access is required.');
      return null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    let stream = streamRef.current;
    if (!stream) {
      stream = await initMicrophone();
      if (!stream) return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      setAudioBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setState(STATES.REVIEW);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(100); // collect in 100ms chunks for responsiveness
    setState(STATES.RECORDING);
  }, [initMicrophone]);

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

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      await fetch(`/api/chunks/${currentChunk.id}/recording`, {
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
      setError('Upload failed. Please try again.');
      setState(STATES.REVIEW);
    }
  }, [audioBlob, audioUrl, currentChunk, currentIndex, session]);

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

  if (state === STATES.WELCOME) {
    return (
      <div className="container">
        <div className="welcome-screen">
          <h1 className="welcome-name">
            Welcome, {session.contributorName}
          </h1>
          <p className="welcome-sub">
            You have {session.chunks.length} line{session.chunks.length !== 1 ? 's' : ''} to record.
          </p>
          <button className="btn btn-primary" onClick={beginSession}>
            BEGIN
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
            YOU HAVE SUCCESSFULLY BEEN A PART OF THE TEAM.
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
          {playingReference ? '...' : 'HEAR REFERENCE'}
        </button>
      )}

      {state === STATES.RECORDING && (
        <div className="recording-indicator">
          <Waveform analyser={analyserRef.current} />
          <div className="recording-now">RECORDING NOW</div>
        </div>
      )}

      <div className="controls">
        {state === STATES.READY && (
          <button className="btn btn-record" onClick={startRecording}>
            RECORD
          </button>
        )}

        {state === STATES.RECORDING && (
          <button className="btn btn-stop" onClick={stopRecording}>
            STOP
          </button>
        )}

        {state === STATES.REVIEW && (
          <>
            <audio src={audioUrl} controls className="playback" />
            <div className="review-controls">
              <button className="btn btn-secondary" onClick={retake}>
                RETAKE
              </button>
              <button className="btn btn-primary" onClick={submitAndNext}>
                {currentIndex + 1 >= session.chunks.length ? 'SUBMIT FINAL' : 'SUBMIT & NEXT'}
              </button>
            </div>
          </>
        )}

        {state === STATES.UPLOADING && (
          <div className="uploading-text">TRANSMITTING...</div>
        )}
      </div>
    </div>
  );
}
