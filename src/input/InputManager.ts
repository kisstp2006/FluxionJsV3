// ============================================================
// FluxionJS V2 — Input Manager
// Keyboard, mouse, gamepad — s&box-style clean API
// ============================================================

import { Engine } from '../core/Engine';
import { EngineEvents } from '../core/EventSystem';

export enum MouseButton {
  Left = 0,
  Middle = 1,
  Right = 2,
}

export interface GamepadState {
  index: number;
  connected: boolean;
  axes: number[];
  buttons: boolean[];
  buttonValues: number[];
}

export class InputManager {
  // Keyboard
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private keysReleased: Set<string> = new Set();

  // Mouse
  mousePosition = { x: 0, y: 0 };
  mouseDelta = { x: 0, y: 0 };
  mouseWheel = 0;
  private mouseButtonsDown: Set<number> = new Set();
  private mouseButtonsPressed: Set<number> = new Set();
  private mouseButtonsReleased: Set<number> = new Set();
  private pointerLocked = false;

  // Gamepads
  gamepads: Map<number, GamepadState> = new Map();

  private engine: Engine;
  private target: HTMLElement;

  constructor(engine: Engine) {
    this.engine = engine;
    this.target = engine.config.canvas;
    this.setupListeners();

    // Clear per-frame state each update
    engine.events.on(EngineEvents.LATE_UPDATE, () => this.endFrame());

    engine.registerSubsystem('input', this);
  }

  private setupListeners(): void {
    // Keyboard
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    });

    // Mouse
    this.target.addEventListener('mousemove', (e) => {
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
      this.mousePosition.x = e.clientX;
      this.mousePosition.y = e.clientY;
    });

    this.target.addEventListener('mousedown', (e) => {
      if (!this.mouseButtonsDown.has(e.button)) {
        this.mouseButtonsPressed.add(e.button);
      }
      this.mouseButtonsDown.add(e.button);
    });

    this.target.addEventListener('mouseup', (e) => {
      this.mouseButtonsDown.delete(e.button);
      this.mouseButtonsReleased.add(e.button);
    });

    this.target.addEventListener('wheel', (e) => {
      this.mouseWheel += e.deltaY;
    }, { passive: true });

    this.target.addEventListener('contextmenu', (e) => e.preventDefault());

    // Pointer Lock
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.target;
    });

    // Gamepad
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepads.set(e.gamepad.index, {
        index: e.gamepad.index,
        connected: true,
        axes: [...e.gamepad.axes],
        buttons: e.gamepad.buttons.map(b => b.pressed),
        buttonValues: e.gamepad.buttons.map(b => b.value),
      });
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      this.gamepads.delete(e.gamepad.index);
    });
  }

  // ── Keyboard API ──

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  isKeyPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  isKeyReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  // ── Mouse API ──

  isMouseDown(button: MouseButton = MouseButton.Left): boolean {
    return this.mouseButtonsDown.has(button);
  }

  isMousePressed(button: MouseButton = MouseButton.Left): boolean {
    return this.mouseButtonsPressed.has(button);
  }

  isMouseReleased(button: MouseButton = MouseButton.Left): boolean {
    return this.mouseButtonsReleased.has(button);
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  lockPointer(): void {
    this.target.requestPointerLock();
  }

  unlockPointer(): void {
    document.exitPointerLock();
  }

  // ── Gamepad API ──

  updateGamepads(): void {
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (!pad) continue;
      const state = this.gamepads.get(pad.index);
      if (state) {
        state.axes = [...pad.axes];
        state.buttons = pad.buttons.map(b => b.pressed);
        state.buttonValues = pad.buttons.map(b => b.value);
      }
    }
  }

  getGamepadAxis(padIndex: number, axisIndex: number, deadzone = 0.1): number {
    const state = this.gamepads.get(padIndex);
    if (!state) return 0;
    const value = state.axes[axisIndex] ?? 0;
    return Math.abs(value) < deadzone ? 0 : value;
  }

  isGamepadButtonDown(padIndex: number, buttonIndex: number): boolean {
    return this.gamepads.get(padIndex)?.buttons[buttonIndex] ?? false;
  }

  // ── Helpers ──

  /** Get horizontal input axis (-1 to 1) from WASD/Arrow keys */
  getAxis(negative: string, positive: string): number {
    return (this.isKeyDown(positive) ? 1 : 0) - (this.isKeyDown(negative) ? 1 : 0);
  }

  get horizontal(): number {
    return this.getAxis('KeyA', 'KeyD') || this.getAxis('ArrowLeft', 'ArrowRight');
  }

  get vertical(): number {
    return this.getAxis('KeyS', 'KeyW') || this.getAxis('ArrowDown', 'ArrowUp');
  }

  private endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouseButtonsPressed.clear();
    this.mouseButtonsReleased.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this.mouseWheel = 0;
    this.updateGamepads();
  }
}
