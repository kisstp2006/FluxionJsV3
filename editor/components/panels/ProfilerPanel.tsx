// ============================================================
// FluxionJS V2 — Profiler Panel Component
// Performance stats + frame time graph
// Inspired by LumixEngine profiler_ui
// ============================================================

import React, { useRef, useEffect, useCallback } from 'react';
import { useEditor, useEngine } from '../../core/EditorContext';

const frameTimeSamples: number[] = [];
const MAX_SAMPLES = 200;

export const ProfilerPanel: React.FC = () => {
  const { state } = useEditor();
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const drawGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update sample
    if (engine) {
      frameTimeSamples.push(engine.engine.time.unscaledDeltaTime * 1000);
      if (frameTimeSamples.length > MAX_SAMPLES) frameTimeSamples.shift();
    }

    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // 16ms line (60fps)
    const targetY = h - (16 / 33) * h;
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(w, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 33ms line (30fps)
    const target30Y = h - (33 / 33) * h;
    ctx.strokeStyle = '#f85149';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, target30Y);
    ctx.lineTo(w, target30Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Frame time bars
    const barWidth = w / MAX_SAMPLES;
    for (let i = 0; i < frameTimeSamples.length; i++) {
      const val = frameTimeSamples[i];
      const barH = Math.min((val / 33) * h, h);
      const x = i * barWidth;

      ctx.fillStyle = val > 16 ? (val > 33 ? '#f85149' : '#d29922') : '#58a6ff';
      ctx.fillRect(x, h - barH, barWidth - 1, barH);
    }

    // Labels
    ctx.fillStyle = '#3fb950';
    ctx.font = '9px monospace';
    ctx.fillText('60fps', w - 30, targetY - 2);

    animationRef.current = requestAnimationFrame(drawGraph);
  }, [engine]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(drawGraph);
    return () => cancelAnimationFrame(animationRef.current);
  }, [drawGraph]);

  const stats = [
    { label: 'Frame Time', value: `${state.frameTime.toFixed(1)}ms`, color: 'var(--accent)' },
    { label: 'Draw Calls', value: String(state.drawCalls), color: 'var(--accent)' },
    { label: 'Triangles', value: state.triangles.toLocaleString(), color: 'var(--accent)' },
    { label: 'Textures', value: String(state.textures), color: 'var(--accent)' },
    { label: 'Geometries', value: String(state.geometries), color: 'var(--accent)' },
    { label: 'Physics', value: String(state.physicsBodies), color: 'var(--accent)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Stats grid */}
      <div style={{
        padding: '8px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 24px',
      }}>
        {stats.map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex',
            gap: '8px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
            <span style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Graph */}
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        style={{
          margin: '4px 16px',
          border: '1px solid var(--border)',
          borderRadius: '4px',
        }}
      />
    </div>
  );
};
