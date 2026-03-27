// ============================================================
// FluxionJS V3 — DebugConsole
// Static logging API that routes messages to the editor console
// via a configurable sink. Falls back to the native console when
// no sink is registered (e.g. in standalone / unit-test builds).
// ============================================================

export type LogType = 'info' | 'warn' | 'error' | 'system';
export type LogSink = (text: string, type: LogType) => void;

/**
 * Static debug logging service.
 *
 * The editor registers a sink via `DebugConsole.setSink()` that routes
 * messages into the editor console panel. Without a sink the calls fall
 * back to the native browser console, so the engine is usable standalone.
 *
 * Scripts access this through the `Debug.Log / Debug.LogWarning / Debug.LogError`
 * globals injected by ScriptSystem.
 *
 * @example
 *   // In any engine subsystem:
 *   import { DebugConsole } from './DebugConsole';
 *   DebugConsole.Log('Renderer ready');
 *   DebugConsole.LogWarning('Missing texture, using default');
 *   DebugConsole.LogError('Failed to load asset: ' + path);
 */
export class DebugConsole {
  private static _sink: LogSink | null = null;

  /**
   * Register the editor console sink.
   * Called once by the editor engine during initialisation.
   */
  static setSink(sink: LogSink | null): void {
    this._sink = sink;
  }

  /** Log an informational message. */
  static Log(...args: any[]): void {
    const text = args.map(String).join(' ');
    if (this._sink) {
      this._sink(text, 'info');
    } else {
      console.log('[Debug]', text);
    }
  }

  /** Log a warning message. */
  static LogWarning(...args: any[]): void {
    const text = args.map(String).join(' ');
    if (this._sink) {
      this._sink(text, 'warn');
    } else {
      console.warn('[Debug]', text);
    }
  }

  /** Log an error message. */
  static LogError(...args: any[]): void {
    const text = args.map(String).join(' ');
    if (this._sink) {
      this._sink(text, 'error');
    } else {
      console.error('[Debug]', text);
    }
  }

  /** Log a system/engine message (shown in accent colour in the editor console). */
  static LogSystem(...args: any[]): void {
    const text = args.map(String).join(' ');
    if (this._sink) {
      this._sink(text, 'system');
    } else {
      console.log('[System]', text);
    }
  }
}
