import React, { useRef, useEffect } from 'react';

export default function Waveform({ analyser }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);
      timeRef.current += 0.02;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Multiple overlapping waveforms for an organic, unsettling feel
      const layers = [
        { color: 'rgba(255, 40, 40, 0.7)', offset: 0, scale: 1.0, speed: 1.0 },
        { color: 'rgba(200, 0, 0, 0.4)', offset: 0.3, scale: 0.8, speed: 1.3 },
        { color: 'rgba(255, 80, 80, 0.25)', offset: 0.7, scale: 1.2, speed: 0.7 },
      ];

      for (const layer of layers) {
        ctx.beginPath();
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = 2;

        const sliceWidth = w / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          // Mix real audio data with organic distortion
          const audioVal = (dataArray[i] / 128.0) - 1.0;
          const t = timeRef.current * layer.speed + layer.offset;

          // Organic wobble — breathing, pulsing quality
          const wobble =
            Math.sin(t * 2.1 + i * 0.05) * 0.08 +
            Math.sin(t * 0.7 + i * 0.02) * 0.15 +
            Math.sin(t * 5.3 + i * 0.1) * 0.03;

          const y = (h / 2) + (audioVal * layer.scale + wobble) * (h / 2) * 0.8;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            // Slightly curved lines for organic feel
            const prevX = x - sliceWidth;
            const cpX = prevX + sliceWidth / 2;
            ctx.quadraticCurveTo(cpX, y + Math.sin(t * 3 + i) * 2, x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();
      }

      // Occasional glitch effect — brief horizontal displacement
      if (Math.random() < 0.03) {
        const glitchY = Math.random() * h;
        const glitchH = 2 + Math.random() * 6;
        const shift = (Math.random() - 0.5) * 20;
        const imgData = ctx.getImageData(0, glitchY, w, glitchH);
        ctx.putImageData(imgData, shift, glitchY);
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={120}
      className="waveform-canvas"
    />
  );
}
