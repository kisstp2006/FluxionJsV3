// ============================================================
// FluxionJS V3 — Icon definitions (lucide-react SVG icons)
// Platform-consistent, scalable vector icons.
// ============================================================

import React from 'react';
import {
  Box,
  Sun,
  Camera,
  Atom,
  Sparkles,
  Diamond,
  Folder,
  File,
  Clapperboard,
  Palette,
  Volume2,
  FileCode,
  Play,
  Pause,
  Square,
  MousePointer,
  Move,
  RotateCw,
  Maximize2,
  Plus,
  Minus,
  X,
  ChevronDown,
  ChevronRight,
  Search,
  Settings,
  Grid3x3,
  Image,
  Shapes,
  Package,
  Wand2,
  FileJson,
  ClipboardList,
  Download,
  RefreshCw,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  Save,
  FolderOpen,
  Undo2,
  Redo2,
  Pencil,
  Crosshair,
  ArrowUpRight,
  Monitor,
  Moon,
  Globe,
  Star,
  Zap,
  Circle,
  Triangle,
  Lightbulb,
  CircleDot,
  RectangleHorizontal,
  Pill,
  TriangleAlert,
  type LucideProps,
} from 'lucide-react';

/** Default icon size used throughout the editor */
const S = 14;
/** Default stroke width */
const W = 1.75;

/** Shorthand to create a sized icon element */
const ic = (C: React.FC<LucideProps>, size = S) =>
  React.createElement(C, { size, strokeWidth: W });

export const Icons = {
  // Entities / Components
  cube:       ic(Box),
  light:      ic(Sun),
  camera:     ic(Camera),
  physics:    ic(Atom),
  particle:   ic(Sparkles),
  entity:     ic(Diamond),

  // Files
  folder:     ic(Folder),
  folderOpen: ic(FolderOpen),
  file:       ic(File),
  scene:      ic(Clapperboard),
  material:   ic(Palette),
  audio:      ic(Volume2),
  script:     ic(FileCode),
  image:      ic(Image),
  model:      ic(Shapes),
  prefab:     ic(Package),
  shader:     ic(Wand2),
  json:       ic(FileJson),

  // Transport
  play:       ic(Play),
  pause:      ic(Pause),
  stop:       ic(Square),

  // Tools
  select:     ic(MousePointer),
  move:       ic(Move),
  rotate:     ic(RotateCw),
  scale:      ic(Maximize2),

  // UI
  plus:       ic(Plus),
  minus:      ic(Minus),
  close:      ic(X),
  minimize:   ic(Minus),
  maximize:   ic(Maximize2),
  chevronDown:  ic(ChevronDown, 10),
  chevronRight: ic(ChevronRight, 10),
  search:     ic(Search),
  settings:   ic(Settings),
  grid:       ic(Grid3x3),
  clipboard:  ic(ClipboardList),
  download:   ic(Download),
  refresh:    ic(RefreshCw),
  copy:       ic(Copy),
  trash:      ic(Trash2),
  eye:        ic(Eye),
  eyeOff:     ic(EyeOff),
  save:       ic(Save),

  // Extra
  undo:       ic(Undo2),
  redo:       ic(Redo2),
  pencil:     ic(Pencil),
  target:     ic(Crosshair),
  externalLink: ic(ArrowUpRight),
  monitor:    ic(Monitor),
  moon:       ic(Moon),
  globe:      ic(Globe),
  star:       ic(Star),
  zap:        ic(Zap),

  // Shapes (for entity creation)
  sphere:     ic(Circle),
  cone:       ic(Triangle),
  plane:      ic(RectangleHorizontal),
  capsule:    ic(Pill),
  torus:      ic(CircleDot),

  // Lights
  pointLight: ic(Lightbulb),

  // Status
  warning:    ic(TriangleAlert),

  // Labels (keep as text for space toggles)
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
