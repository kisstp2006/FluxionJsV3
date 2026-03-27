// ============================================================
// FluxionJS V3 — Icon definitions (Feather SVG icons)
// All icons are rendered white (currentColor) so they adapt to
// the editor's dark theme automatically.
// Transport controls (play / stop) and status icons get a
// single accent colour so their function is instantly obvious.
// ============================================================

import React from 'react';
import { SvgIcon } from './SvgIcon';

// ── Raw SVG imports (webpack asset/source → string) ──────────

import boxSvg        from './icons/box.svg';
import sunSvg        from './icons/sun.svg';
import cameraSvg     from './icons/camera.svg';
import cpuSvg        from './icons/cpu.svg';
import windSvg       from './icons/wind.svg';
import hexagonSvg    from './icons/hexagon.svg';

import folderSvg     from './icons/folder.svg';
import fileSvg       from './icons/file.svg';
import filmSvg       from './icons/film.svg';
import apertureSvg   from './icons/aperture.svg';
import volume2Svg    from './icons/volume-2.svg';
import terminalSvg   from './icons/terminal.svg';
import imageSvg      from './icons/image.svg';
import packageSvg    from './icons/package.svg';
import layersSvg     from './icons/layers.svg';
import penToolSvg    from './icons/pen-tool.svg';
import fileTextSvg   from './icons/file-text.svg';

import playSvg       from './icons/play.svg';
import pauseSvg      from './icons/pause.svg';
import squareSvg     from './icons/square.svg';

import mousePointerSvg from './icons/mouse-pointer.svg';
import moveSvg       from './icons/move.svg';
import rotateCwSvg   from './icons/rotate-cw.svg';
import maximize2Svg  from './icons/maximize-2.svg';

import plusSvg       from './icons/plus.svg';
import minusSvg      from './icons/minus.svg';
import xSvg          from './icons/x.svg';
import chevronDownSvg  from './icons/chevron-down.svg';
import chevronRightSvg from './icons/chevron-right.svg';
import searchSvg     from './icons/search.svg';
import settingsSvg   from './icons/settings.svg';
import gridSvg       from './icons/grid.svg';
import clipboardSvg  from './icons/clipboard.svg';
import downloadSvg   from './icons/download.svg';
import refreshCwSvg  from './icons/refresh-cw.svg';
import copySvg       from './icons/copy.svg';
import trash2Svg     from './icons/trash-2.svg';
import eyeSvg        from './icons/eye.svg';
import eyeOffSvg     from './icons/eye-off.svg';
import saveSvg       from './icons/save.svg';

import rotateCcwSvg      from './icons/rotate-ccw.svg';
import cornerUpRightSvg  from './icons/corner-up-right.svg';
import edit2Svg          from './icons/edit-2.svg';
import crosshairSvg      from './icons/crosshair.svg';
import externalLinkSvg   from './icons/external-link.svg';
import monitorSvg        from './icons/monitor.svg';
import moonSvg           from './icons/moon.svg';
import globeSvg          from './icons/globe.svg';
import starSvg           from './icons/star.svg';
import zapSvg            from './icons/zap.svg';

import circleSvg     from './icons/circle.svg';
import triangleSvg   from './icons/triangle.svg';
import databaseSvg   from './icons/database.svg';
import loaderSvg     from './icons/loader.svg';

import alertTriangleSvg from './icons/alert-triangle.svg';
import infoSvg           from './icons/info.svg';
import activitySvg       from './icons/activity.svg';
import clockSvg          from './icons/clock.svg';
import layoutSvg         from './icons/layout.svg';
import codeSvg           from './icons/code.svg';

// ── Helpers ──────────────────────────────────────────────────

/** Default icon size (px) */
const S = 14;

/**
 * Create a React element for an icon at the default size with white colour.
 * Pass `size` to override, `color` for accent-coloured icons.
 */
const ic = (svg: string, size = S, color = 'currentColor') =>
  React.createElement(SvgIcon, { svg, size, color });

// ── Accent colours ────────────────────────────────────────────
// Only a handful of icons use a fixed colour to communicate
// their function at a glance.  Everything else inherits from CSS.

const GREEN  = '#4ade80';  // play
const RED    = '#f87171';  // stop
const AMBER  = '#fbbf24';  // warning / pause

// ── Icon map ─────────────────────────────────────────────────

export const Icons = {
  // ── Entities / Components ────────────────────────────────────
  cube:       ic(boxSvg),           // generic entity / game object
  light:      ic(sunSvg),           // light component
  camera:     ic(cameraSvg),        // camera component
  physics:    ic(cpuSvg),           // physics / rigidbody
  particle:   ic(windSvg),          // particle emitter
  entity:     ic(hexagonSvg),       // abstract entity

  // ── File types ───────────────────────────────────────────────
  folder:     ic(folderSvg),
  folderOpen: ic(folderSvg),        // feather v1 has no "folder-open" variant
  file:       ic(fileSvg),
  scene:      ic(filmSvg),          // .fluxscene → film strip
  material:   ic(apertureSvg),      // .fluxmat  → lens aperture = rendering
  audio:      ic(volume2Svg),
  script:     ic(terminalSvg),      // .ts/.js   → terminal / code
  image:      ic(imageSvg),
  model:      ic(packageSvg),       // .glb/.obj → packaged geometry
  prefab:     ic(layersSvg),        // prefab    → layered/composite
  shader:     ic(penToolSvg),       // .glsl     → pen tool = authoring
  json:       ic(fileTextSvg),

  // ── Transport ─────────────────────────────────────────────────
  play:       ic(playSvg,  S, GREEN),
  pause:      ic(pauseSvg, S, AMBER),
  stop:       ic(squareSvg, S, RED),

  // ── Transform tools ──────────────────────────────────────────
  select:     ic(mousePointerSvg),
  move:       ic(moveSvg),
  rotate:     ic(rotateCwSvg),
  scale:      ic(maximize2Svg),

  // ── Generic UI ───────────────────────────────────────────────
  plus:         ic(plusSvg),
  minus:        ic(minusSvg),
  close:        ic(xSvg),
  minimize:     ic(minusSvg),
  maximize:     ic(maximize2Svg),
  chevronDown:  ic(chevronDownSvg,  10),
  chevronRight: ic(chevronRightSvg, 10),
  search:       ic(searchSvg),
  settings:     ic(settingsSvg),
  grid:         ic(gridSvg),
  clipboard:    ic(clipboardSvg),
  download:     ic(downloadSvg),
  refresh:      ic(refreshCwSvg),
  copy:         ic(copySvg),
  trash:        ic(trash2Svg),
  eye:          ic(eyeSvg),
  eyeOff:       ic(eyeOffSvg),
  save:         ic(saveSvg),

  // ── Extra ─────────────────────────────────────────────────────
  undo:         ic(rotateCcwSvg),
  redo:         ic(cornerUpRightSvg),
  pencil:       ic(edit2Svg),
  target:       ic(crosshairSvg),
  externalLink: ic(externalLinkSvg),
  monitor:      ic(monitorSvg),
  moon:         ic(moonSvg),
  globe:        ic(globeSvg),
  star:         ic(starSvg),
  zap:          ic(zapSvg),

  // ── Primitive shapes (entity creation) ───────────────────────
  sphere:   ic(circleSvg),
  cone:     ic(triangleSvg),
  plane:    ic(squareSvg),          // flat surface = square
  capsule:  ic(databaseSvg),        // cylinder-like silhouette
  torus:    ic(loaderSvg),          // ring with gap

  // ── Light sub-types ───────────────────────────────────────────
  pointLight: ic(starSvg),          // star = omnidirectional point

  // ── Status ────────────────────────────────────────────────────
  warning:  ic(alertTriangleSvg, S, AMBER),
  info:     ic(infoSvg),

  // ── Extra panel icons ─────────────────────────────────────────
  activity: ic(activitySvg),   // profiler / performance
  clock:    ic(clockSvg),      // history / time
  layout:   ic(layoutSvg),     // FUI / UI layout
  code:     ic(codeSvg),       // general code
  terminal: ic(terminalSvg),   // console / terminal output

  // ── Labels (kept as text for space toggles) ───────────────────
  localSpace: 'L' as unknown as React.ReactElement,
  worldSpace: 'W' as unknown as React.ReactElement,
} as const;

/**
 * Resolve a string icon name (used in registries) to a React element.
 * Falls back to the generic file icon.
 */
export function resolveIcon(name: string): React.ReactNode {
  return (Icons as Record<string, React.ReactNode>)[name] ?? Icons.file;
}
