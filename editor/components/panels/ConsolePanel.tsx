// ============================================================
// FluxionJS V2 — Console Panel Component
// Log output + command input (LumixEngine log_ui style)
// ============================================================

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useEditor, useEngine } from '../../core/EditorContext';

export const ConsolePanel: React.FC = () => {
  const { state, dispatch, log } = useEditor();
  const engine = useEngine();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [state.consoleEntries.length]);

  const executeCommand = useCallback((cmd: string) => {
    log(`> ${cmd}`, 'info');
    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);

    const parts = cmd.trim().split(' ');
    switch (parts[0]) {
      case 'help':
        log('Commands: help, clear, stats, entities, select <id>, fps, scene', 'system');
        break;
      case 'clear':
        dispatch({ type: 'CLEAR_CONSOLE' });
        break;
      case 'stats':
        if (engine) {
          const info = engine.renderer.renderer.info;
          log(`Draw calls: ${info.render.calls}`, 'info');
          log(`Triangles: ${info.render.triangles}`, 'info');
          log(`Textures: ${info.memory.textures}`, 'info');
          log(`Geometries: ${info.memory.geometries}`, 'info');
        }
        break;
      case 'entities':
        if (engine) {
          log(`Total entities: ${[...engine.engine.ecs.getAllEntities()].length}`, 'info');
        }
        break;
      case 'select':
        if (engine) {
          const id = parseInt(parts[1]);
          if (!isNaN(id) && engine.engine.ecs.entityExists(id)) {
            dispatch({ type: 'SELECT_ENTITY', entity: id });
            log(`Selected entity ${id}: ${engine.engine.ecs.getEntityName(id)}`, 'info');
          } else {
            log(`Entity ${parts[1]} not found`, 'error');
          }
        }
        break;
      case 'fps':
        if (engine) log(`FPS: ${engine.engine.time.smoothFps}`, 'info');
        break;
      case 'scene':
        if (engine) {
          const json = engine.scene.toJSON();
          log(`Scene serialized (${json.length} bytes)`, 'system');
        }
        break;
      default:
        log(`Unknown command: ${parts[0]}`, 'error');
    }
  }, [engine, log, dispatch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && command.trim()) {
      executeCommand(command.trim());
      setCommand('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const idx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(idx);
        setCommand(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx >= 0) {
        const idx = historyIdx + 1;
        if (idx >= history.length) {
          setHistoryIdx(-1);
          setCommand('');
        } else {
          setHistoryIdx(idx);
          setCommand(history[idx]);
        }
      }
    }
  };

  const typeColors: Record<string, string> = {
    info: 'var(--text-primary)',
    warn: 'var(--accent-yellow)',
    error: 'var(--accent-red)',
    system: 'var(--accent)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Output */}
      <div
        ref={outputRef}
        style={{
          flex: 1,
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          overflowY: 'auto',
          lineHeight: 1.6,
        }}
      >
        {state.consoleEntries.map((entry, i) => {
          const ts = `${entry.time.getHours().toString().padStart(2, '0')}:${entry.time.getMinutes().toString().padStart(2, '0')}:${entry.time.getSeconds().toString().padStart(2, '0')}`;
          return (
            <div key={i} style={{ color: typeColors[entry.type], padding: '1px 0' }}>
              <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>[{ts}]</span>
              {entry.text}
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 8px',
        borderTop: '1px solid var(--border)',
        gap: '6px',
      }}>
        <span style={{
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
        }}>
          &gt;
        </span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type command..."
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
};
