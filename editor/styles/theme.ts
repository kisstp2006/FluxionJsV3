// ============================================================
// FluxionJS V3 — Design System Theme
// Cocos Creator / Unity-style professional dark UI
// ============================================================

export const theme = {
  colors: {
    bgPrimary:    '#1a1a1a',
    bgSecondary:  '#252526',
    bgTertiary:   '#2d2d30',
    bgPanel:      '#1e1e1e',
    bgHover:      '#2d2d30',
    bgActive:     '#094771',
    bgInput:      '#1e1e1e',
    bgDropdown:   '#252526',
    bgToolbar:    '#2d2d30',
    border:       '#3c3c3c',
    borderSubtle: '#2d2d30',
    borderFocus:  '#4d9eff',
    textPrimary:   '#cccccc',
    textSecondary: '#9d9d9d',
    textMuted:     '#5a5a5a',
    textDisabled:  '#555555',
    accent:       '#4d9eff',
    accentHover:  '#6db3ff',
    accentDim:    'rgba(77,158,255,0.15)',
    green:        '#4ec94e',
    red:          '#f14c4c',
    yellow:       '#cca700',
    purple:       '#c586c0',
    orange:       '#ce9178',
    axisX:        '#e06c75',
    axisY:        '#98c379',
    axisZ:        '#61afef',
  },
  fonts: {
    mono: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
    ui: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  size: {
    inputHeight:   '22px',
    inputHeightSm: '18px',
    inputHeightLg: '26px',
    inputPadding:  '2px 6px',
    inputRadius:   '3px',
    checkboxSize:  '14px',
    panelRadius:   '4px',
  },
  panelRadius: '4px',
  transition: '120ms ease',
  transitionFast: '80ms ease',
} as const;

export type Theme = typeof theme;
