// ============================================================
// FluxionJS V3 — Audio Asset Inspector
// Play/pause, waveform visualization, metadata display.
// ============================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Section, PropertyRow, Slider } from '../../../ui';
import { AssetInspectorProps } from '../../../core/AssetInspectorRegistry';
import { getFileSystem } from '../../../../src/filesystem';
import type { FileInfo } from '../../../../src/filesystem/FileSystem';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const AudioInspector: React.FC<AssetInspectorProps> = ({ assetPath }) => {
  const [fileStat, setFileStat] = useState<FileInfo | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fileName = assetPath.replace(/\\/g, '/').split('/').pop() || '';
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  // Load audio buffer
  useEffect(() => {
    let cancelled = false;
    const fs = getFileSystem();

    fs.stat(assetPath).then((stat) => {
      if (!cancelled) setFileStat(stat);
    }).catch(() => {});

    fs.readBinary(assetPath).then(async (data) => {
      if (cancelled) return;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      try {
        const buffer = await ctx.decodeAudioData(data);
        if (cancelled) { ctx.close(); return; }
        bufferRef.current = buffer;
        setDuration(buffer.duration);
        drawWaveform(buffer);
      } catch {
        if (!cancelled) setError('Failed to decode audio');
      }
    }).catch(() => {
      if (!cancelled) setError('Failed to read audio file');
    });

    return () => {
      cancelled = true;
      stopPlayback();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [assetPath]);

  // Update gain when volume changes
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  const drawWaveform = useCallback((buffer: AudioBuffer) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / w);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'var(--bg-input)';
    ctx.fillRect(0, 0, w, h);

    ctx.beginPath();
    ctx.strokeStyle = '#ffb74d';
    ctx.lineWidth = 1;

    for (let i = 0; i < w; i++) {
      let min = 1.0, max = -1.0;
      for (let j = 0; j < step; j++) {
        const val = data[i * step + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const yMin = ((1 + min) / 2) * h;
      const yMax = ((1 + max) / 2) * h;
      ctx.moveTo(i, yMin);
      ctx.lineTo(i, yMax);
    }
    ctx.stroke();
  }, []);

  const stopPlayback = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buffer = bufferRef.current;
    if (!ctx || !buffer) return;

    stopPlayback();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gainRef.current = gain;
    source.connect(gain).connect(ctx.destination);

    source.onended = () => {
      setIsPlaying(false);
      offsetRef.current = 0;
      setCurrentTime(0);
      cancelAnimationFrame(rafRef.current);
    };

    const offset = offsetRef.current;
    source.start(0, offset);
    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime - offset;
    setIsPlaying(true);

    const tick = () => {
      if (!audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startTimeRef.current;
      setCurrentTime(Math.min(elapsed, buffer.duration));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [volume, stopPlayback]);

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    offsetRef.current = ctx.currentTime - startTimeRef.current;
    stopPlayback();
  }, [stopPlayback]);

  const stop = useCallback(() => {
    stopPlayback();
    offsetRef.current = 0;
    setCurrentTime(0);
  }, [stopPlayback]);

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    fontSize: '11px',
  };

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: '11px',
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };

  return (
    <>
      {/* Player */}
      <Section title="Audio Player" defaultOpen>
        {error ? (
          <div style={{ padding: '8px 12px', color: 'var(--accent-red)', fontSize: '11px' }}>{error}</div>
        ) : (
          <div style={{ padding: '4px 12px' }}>
            {/* Waveform */}
            <canvas
              ref={canvasRef}
              width={260}
              height={48}
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '4px',
                marginBottom: '6px',
                display: 'block',
              }}
            />

            {/* Time */}
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '6px', textAlign: 'center' }}>
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '8px' }}>
              <button style={btnStyle} onClick={isPlaying ? pause : play}>
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button style={btnStyle} onClick={stop}>⏹</button>
            </div>

            {/* Volume */}
            <PropertyRow label="Volume">
              <Slider value={volume} onChange={setVolume} min={0} max={1} step={0.01} />
            </PropertyRow>
          </div>
        )}
      </Section>

      {/* Info */}
      <Section title="Audio Info" defaultOpen>
        <PropertyRow label="File">
          <span style={labelStyle}>{fileName}</span>
        </PropertyRow>
        <PropertyRow label="Format">
          <span style={{ ...labelStyle, color: '#ffb74d' }}>{ext.replace('.', '').toUpperCase()}</span>
        </PropertyRow>
        {duration > 0 && (
          <PropertyRow label="Duration">
            <span style={labelStyle}>{formatDuration(duration)}</span>
          </PropertyRow>
        )}
        {bufferRef.current && (
          <>
            <PropertyRow label="Sample Rate">
              <span style={labelStyle}>{bufferRef.current.sampleRate} Hz</span>
            </PropertyRow>
            <PropertyRow label="Channels">
              <span style={labelStyle}>{bufferRef.current.numberOfChannels}</span>
            </PropertyRow>
          </>
        )}
        {fileStat && (
          <PropertyRow label="Size">
            <span style={labelStyle}>{formatBytes(fileStat.size)}</span>
          </PropertyRow>
        )}
      </Section>
    </>
  );
};
