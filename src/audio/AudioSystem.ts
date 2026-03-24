// ============================================================
// FluxionJS V2 — Spatialized Audio System
// Nuake-inspired 3D audio with Web Audio API
// ============================================================

import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { ECSManager, EntityId, System } from '../core/ECS';
import { EngineEvents } from '../core/EventSystem';
import { TransformComponent, AudioSourceComponent, CameraComponent } from '../core/Components';
import { AssetManager } from '../assets/AssetManager';

export class AudioSystem {
  private context: AudioContext;
  private masterGain: GainNode;
  private listener: AudioListener;
  private buffers: Map<string, AudioBuffer> = new Map();
  private engine: Engine;

  masterVolume = 1;

  constructor(engine: Engine) {
    this.engine = engine;
    this.context = new AudioContext();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.listener = this.context.listener;

    // Register ECS system
    engine.ecs.addSystem(new AudioSyncSystem(this));

    // Resume context on user interaction
    const resume = () => {
      if (this.context.state === 'suspended') {
        this.context.resume();
      }
    };
    document.addEventListener('click', resume, { once: true });
    document.addEventListener('keydown', resume, { once: true });

    engine.registerSubsystem('audio', this);
  }

  getContext(): AudioContext {
    return this.context;
  }

  async loadClip(path: string): Promise<AudioBuffer> {
    const existing = this.buffers.get(path);
    if (existing) return existing;

    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await this.context.decodeAudioData(arrayBuffer);
    this.buffers.set(path, buffer);
    return buffer;
  }

  play(
    audioComp: AudioSourceComponent,
    position?: THREE.Vector3
  ): void {
    const buffer = this.buffers.get(audioComp.clip);
    if (!buffer) return;

    // Create audio graph: Source → Gain → Panner → Master
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = audioComp.loop;
    source.playbackRate.value = audioComp.pitch;

    const gainNode = this.context.createGain();
    gainNode.gain.value = audioComp.volume;

    if (audioComp.spatial && position) {
      const panner = this.context.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = audioComp.minDistance;
      panner.maxDistance = audioComp.maxDistance;
      panner.rolloffFactor = audioComp.rolloffFactor;
      panner.positionX.value = position.x;
      panner.positionY.value = position.y;
      panner.positionZ.value = position.z;

      source.connect(gainNode);
      gainNode.connect(panner);
      panner.connect(this.masterGain);

      audioComp.pannerNode = panner;
    } else {
      source.connect(gainNode);
      gainNode.connect(this.masterGain);
    }

    audioComp.source = source;
    audioComp.gainNode = gainNode;

    source.start();
  }

  stop(audioComp: AudioSourceComponent): void {
    if (audioComp.source) {
      try {
        audioComp.source.stop();
      } catch {
        // Already stopped
      }
      audioComp.source = null;
    }
  }

  updateListenerPosition(position: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
    if (this.listener.positionX) {
      this.listener.positionX.value = position.x;
      this.listener.positionY.value = position.y;
      this.listener.positionZ.value = position.z;
      this.listener.forwardX.value = forward.x;
      this.listener.forwardY.value = forward.y;
      this.listener.forwardZ.value = forward.z;
      this.listener.upX.value = up.x;
      this.listener.upY.value = up.y;
      this.listener.upZ.value = up.z;
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.masterGain.gain.value = this.masterVolume;
  }

  dispose(): void {
    this.context.close();
    this.buffers.clear();
  }
}

// ── Audio ECS System ──

class AudioSyncSystem implements System {
  readonly name = 'AudioSync';
  readonly requiredComponents = ['Transform', 'AudioSource'];
  priority = 60;
  enabled = true;
  private started: Set<EntityId> = new Set();

  constructor(private audio: AudioSystem) {}

  update(entities: Set<EntityId>, ecs: ECSManager): void {
    for (const entity of entities) {
      const audioComp = ecs.getComponent<AudioSourceComponent>(entity, 'AudioSource');
      const transform = ecs.getComponent<TransformComponent>(entity, 'Transform');
      if (!audioComp || !transform) continue;

      // Auto-play on start
      if (audioComp.playOnStart && !this.started.has(entity)) {
        this.audio.play(audioComp, transform.position);
        this.started.add(entity);
      }

      // Update panner position
      if (audioComp.pannerNode) {
        audioComp.pannerNode.positionX.value = transform.position.x;
        audioComp.pannerNode.positionY.value = transform.position.y;
        audioComp.pannerNode.positionZ.value = transform.position.z;
      }
    }

    // Update listener from camera
    const cameras = ecs.query('Transform', 'Camera');
    if (cameras.length > 0) {
      const camTransform = ecs.getComponent<TransformComponent>(cameras[0], 'Transform');
      if (camTransform) {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camTransform.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camTransform.quaternion);
        this.audio.updateListenerPosition(camTransform.position, forward, up);
      }
    }
  }
}
