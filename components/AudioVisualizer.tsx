
import React, { useEffect, useRef } from 'react';

const AudioVisualizer: React.FC<{ stream: MediaStream | null; isActive: boolean }> = ({ stream, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !isActive || !canvasRef.current) return;

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();
    sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
    
    analyserRef.current.fftSize = 256;
    sourceRef.current.connect(analyserRef.current);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Draw circular waveform
      ctx.beginPath();
      ctx.strokeStyle = '#F59E0B'; // Amber 500
      ctx.lineWidth = 2;

      for (let i = 0; i < bufferLength; i++) {
        const rads = (Math.PI * 2) / bufferLength;
        const v = dataArray[i] / 128.0;
        const r = 15 + (v * 10); // Base radius + frequency
        const x = centerX + Math.cos(i * rads) * r;
        const y = centerY + Math.sin(i * rads) * r;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      
      ctx.closePath();
      ctx.stroke();

      // Inner glow
      const avg = dataArray.reduce((a,b) => a+b,0) / bufferLength;
      ctx.beginPath();
      ctx.arc(centerX, centerY, avg / 10, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(245, 158, 11, ${avg/255})`;
      ctx.fill();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
      audioContextRef.current?.close();
    };
  }, [stream, isActive]);

  if (!isActive) return null;

  return (
    <div className="absolute top-4 right-4 bg-white/50 backdrop-blur-sm p-2 rounded-full shadow-sm">
      <canvas ref={canvasRef} width={60} height={60} />
      <div className="text-[10px] text-center text-amber-800 font-bold uppercase tracking-wider mt-1">Mic</div>
    </div>
  );
};

export default AudioVisualizer;
