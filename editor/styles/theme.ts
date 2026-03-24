// ============================================================
// FluxionJS V2 — Design System Theme
// Inspired by s&box dark theme + LumixEngine + Nuake
// ============================================================

export const theme = {
  colors: {
    bgPrimary: '#0d1117',
    bgSecondary: '#161b22',
    bgTertiary: '#1c2333',
    bgPanel: '#13171f',
    bgHover: '#1f2937',
    bgActive: '#253249',
    bgInput: '#0d1117',
    border: '#30363d',
    borderFocus: '#58a6ff',
    textPrimary: '#e6edf3',
    textSecondary: '#8b949e',
    textMuted: '#484f58',
    accent: '#58a6ff',
    accentHover: '#79c0ff',
    green: '#3fb950',
    red: '#f85149',
    yellow: '#d29922',
    purple: '#bc8cff',
    axisX: '#f85149',
    axisY: '#3fb950',
    axisZ: '#58a6ff',
  },
  fonts: {
    mono: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
    ui: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  panelRadius: '6px',
  transition: '150ms ease',
} as const;

export type Theme = typeof theme;
