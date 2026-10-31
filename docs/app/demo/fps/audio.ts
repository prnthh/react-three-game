import { LocomotionClock } from "./animation";
import { wallDistance } from './shared/map';
import type { ImpactMaterial } from './shared/protocol';
import type { MatchSnapshot } from './shared/protocol';
export type SoundCue = { kind: 'shot' | 'step' | 'explosion' | 'impact'; x: number; y: number; z: number; local: boolean; hard?: boolean; material?: ImpactMaterial };

type SoundPosition = { x: number; y: number; z: number };
/** The two authored building volumes; outside and above the roof are dry. */
export function audioRoom(p: SoundPosition): number {
  return p.y >= 0 && p.y < 4 && Math.abs(p.z) < 16 && Math.abs(p.x) > 7 && Math.abs(p.x) < 19
    ? (p.x < 0 ? 0 : 1) : -1;
}

/** Three short visibility tests soften doorway edges. Only evaluated when a cue starts. */
export function soundEnvironment(cue: SoundCue, listener: SoundPosition) {
  let blocked = 0;
  if (!cue.local) {
    const dx = listener.x - cue.x, dz = listener.z - cue.z;
    const horizontal = Math.max(0.001, Math.hypot(dx, dz));
    for (const offset of [-0.18, 0, 0.18]) {
      const x = listener.x + dz / horizontal * offset - cue.x;
      const y = listener.y - cue.y;
      const z = listener.z - dx / horizontal * offset - cue.z;
      const distance = Math.hypot(x, y, z);
      if (distance > 0.01 && wallDistance([cue.x, cue.y, cue.z], [x / distance, y / distance, z / distance], distance) < distance - 0.02)
        blocked++;
    }
  }
  const occlusion = blocked / 3;
  return { occlusion, gain: 1 - occlusion * 0.7,
    cutoff: 18000 * Math.pow((cue.kind !== 'step' ? 1100 : 750) / 18000, occlusion),
    room: audioRoom(cue) };
}

/** Presentation-only event cursor. Tick and actor identity prevent snapshot replays. */
export class SoundCues {
  private tick = -1;
  private viewEpoch = 0;
  private explosions = new Set<number>();
  private shots = new Map<number, number>();
  private walkers = new Map<number, { x: number; z: number; clock: LocomotionClock; deaths: number; grounded: boolean; steps: number }>();
  locomotion(id: number) { return this.walkers.get(id)?.clock; }
  update(state: MatchSnapshot, playing: boolean, emit: (cue: SoundCue) => void, viewActorId = 0, viewEpoch = 0) {
    if (viewEpoch !== this.viewEpoch) {
      this.viewEpoch = viewEpoch; this.tick = -1; this.shots.clear(); this.walkers.clear(); this.explosions.clear();
      for (const s of state.shots) this.shots.set(s.shooter, s.tick);
      for (const e of state.explosions) this.explosions.add(e.id);
    }
    if (state.tick < this.tick) { this.shots.clear(); this.walkers.clear(); this.explosions.clear(); }
    this.tick = state.tick;
    for (const shot of state.shots) {
      if (shot.tick <= (this.shots.get(shot.shooter) ?? -1)) continue;
      this.shots.set(shot.shooter, shot.tick);
      if (playing) {
        emit({ kind: 'shot', x: shot.from[0], y: shot.from[1], z: shot.from[2], local: shot.shooter === viewActorId });
        if (shot.impact && shot.impact !== 'none') {
          // Lift the source just off the surface toward the incoming ray so the
          // wall that was hit does not occlude its own front-face impact sound.
          const dx = shot.from[0] - shot.to[0], dy = shot.from[1] - shot.to[1], dz = shot.from[2] - shot.to[2];
          const offset = 0.025 / Math.max(0.025, Math.hypot(dx, dy, dz));
          emit({ kind: 'impact', material: shot.impact, x: shot.to[0] + dx * offset,
            y: shot.to[1] + dy * offset, z: shot.to[2] + dz * offset, local: shot.victim === viewActorId });
        }
      }
    }
    for (const e of state.explosions) {
      if (!this.explosions.has(e.id) && playing) emit({ kind: 'explosion', x: e.x, y: e.y, z: e.z, local: false });
      this.explosions.add(e.id);
    }
    for (const id of this.explosions) if (!state.explosions.some(e => e.id === id)) this.explosions.delete(id);
    for (const a of state.actors) {
      const grounded = a.hp > 0 && a.y < 0.02;
      let walker = this.walkers.get(a.id);
      if (!walker) {
        walker = { x: a.x, z: a.z, clock: new LocomotionClock(), deaths: a.deaths, grounded, steps: a.gait.steps };
        this.walkers.set(a.id, walker);
      }
      const distance = Math.hypot(a.x - walker.x, a.z - walker.z);
      const continuous = playing && grounded && walker.grounded && walker.deaths === a.deaths && distance < 2.5;
      if (continuous) {
        const contacts = Math.max(0, Math.min(4, a.gait.steps - walker.steps));
        for (let i = 0; i < contacts; i++) {
          emit({ kind: 'step', x: a.x, y: a.y + 0.1, z: a.z, local: a.id === viewActorId,
            hard: Math.abs(Math.abs(a.x) - 13) < 6 && Math.abs(a.z) < 16 });
        }
      }
      Object.assign(walker.clock, a.gait);
      walker.steps = a.gait.steps;
      walker.x = a.x; walker.z = a.z; walker.deaths = a.deaths; walker.grounded = grounded;
    }
  }
}

/** Browser-only audio output: cached samples, bounded voices, world-space HRTF panning. */
export class SpatialAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private rooms: { convolver: ConvolverNode; output: GainNode }[] = [];
  private listenerRoom = -1;
  private voices = new Set<AudioBufferSourceNode>();
  private x = 0; private y = 0; private z = 0;
  enable() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -12; limiter.ratio.value = 8;
      this.master.connect(limiter); limiter.connect(this.context.destination);
      this.buffers.clear();
    }
    if (!this.rooms.length) {
      const ctx = this.context;
      for (let room = 0; room < 2; room++) {
        const convolver = ctx.createConvolver(), output = ctx.createGain();
        const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * (room ? 0.7 : 0.55)), ctx.sampleRate);
        let seed = 71 + room;
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          let low = 0;
          for (let i = 0; i < data.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            low = low * 0.6 + (seed / 4294967296 * 2 - 1) * 0.4;
            const t = i / ctx.sampleRate;
            data[i] = t < 0.018 ? 0 : low * Math.exp(-t * 11);
          }
        }
        convolver.buffer = impulse;
        output.gain.value = 0.04;
        convolver.connect(output); output.connect(this.master!);
        this.rooms.push({ convolver, output });
      }
      this.listenerRoom = -2;
    }
    void this.context.resume().catch(() => {});
  }
  listener(x: number, y: number, z: number, yaw: number, pitch: number) {
    this.x = x; this.y = y; this.z = z;
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running') return;
    const l = ctx.listener, t = ctx.currentTime;
    const room = audioRoom({ x, y, z });
    if (room !== this.listenerRoom) {
      this.rooms.forEach((bus, i) => bus.output.gain.setTargetAtTime(room === i ? 0.22 : room < 0 ? 0.04 : 0.015, t, 0.12));
      this.listenerRoom = room;
    }
    const values: [AudioParam, number][] = [
      [l.positionX, x], [l.positionY, y], [l.positionZ, z],
      [l.forwardX, -Math.sin(yaw) * Math.cos(pitch)], [l.forwardY, Math.sin(pitch)], [l.forwardZ, -Math.cos(yaw) * Math.cos(pitch)],
      [l.upX, Math.sin(yaw) * Math.sin(pitch)], [l.upY, Math.cos(pitch)], [l.upZ, Math.cos(yaw) * Math.sin(pitch)],
    ];
    for (const [parameter, value] of values) parameter.setValueAtTime(value, t);
  }
  play = (cue: SoundCue) => {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !this.master) return;
    const distance = Math.hypot(cue.x - this.x, cue.y - this.y, cue.z - this.z);
    if (distance > (cue.kind !== 'step' ? 65 : 22)) return;
    if (this.voices.size >= 24) {
      if (!cue.local) return;
      const oldest = this.voices.values().next().value;
      oldest?.stop(); if (oldest) this.voices.delete(oldest);
    }
    const key = cue.kind === 'impact' ? `impact-${cue.material}` : cue.kind !== 'step' ? cue.kind : cue.hard ? 'tile' : 'grit';
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const duration = cue.kind === 'explosion' ? 0.65 : cue.kind === 'impact' && cue.material === 'metal' ? 0.28 : cue.kind === 'shot' ? 0.18 : 0.12;
      buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let low = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate, noise = Math.random() * 2 - 1;
        low = low * 0.82 + noise * 0.18;
        data[i] = cue.kind === 'impact'
          ? cue.material === 'metal'
            ? noise * Math.exp(-t * 100) * 0.35 + (Math.sin(t * 2 * Math.PI * 1900) + Math.sin(t * 2 * Math.PI * 3170)) * Math.exp(-t * 24) * 0.18
            : cue.material === 'body'
              ? low * Math.exp(-t * 55) * 0.8 + Math.sin(t * 2 * Math.PI * 135) * Math.exp(-t * 65) * 0.35
              : cue.material === 'ground'
                ? low * Math.exp(-t * 45) * 0.75 + noise * Math.exp(-t * 95) * 0.2
                : noise * Math.exp(-t * 85) * 0.65 + low * Math.exp(-t * 40) * 0.3
          : cue.kind === 'explosion'
          ? (low * 0.85 + Math.sin(t * 2 * Math.PI * 48) * 0.3) * Math.exp(-t * 7)
          : cue.kind === 'shot'
          ? noise * Math.exp(-t * 48) * 0.6 + Math.sin(t * 2 * Math.PI * 95) * Math.exp(-t * 32) * 0.4
          : low * Math.exp(-t * 35) * 0.7 + Math.sin(t * 2 * Math.PI * (cue.hard ? 180 : 95)) * Math.exp(-t * 60) * 0.3;
      }
      this.buffers.set(key, buffer);
    }
    const environment = soundEnvironment(cue, { x: this.x, y: this.y, z: this.z });
    const source = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createPanner();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = environment.cutoff; filter.Q.value = 0.7;
    source.buffer = buffer;
    source.playbackRate.value = 0.94 + Math.random() * 0.12;
    gain.gain.value = environment.gain * (cue.kind === 'impact' ? (cue.local ? 0.9 : 0.7) : cue.kind === 'explosion' ? 1 : cue.kind === 'shot' ? (cue.local ? 0.65 : 0.8) : (cue.local ? 0.65 : 1));
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse';
    pan.refDistance = cue.kind === 'explosion' ? 6 : cue.kind === 'shot' ? 3 : 1.5;
    pan.rolloffFactor = cue.kind === 'shot' ? 1.2 : 1.8;
    pan.maxDistance = 70;
    pan.positionX.value = cue.x; pan.positionY.value = cue.y; pan.positionZ.value = cue.z;
    source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(this.master);
    // The wet path shares occlusion and positional attenuation; walls never leak a full-volume reverb send.
    if (environment.room >= 0 && this.rooms[environment.room]) pan.connect(this.rooms[environment.room].convolver);
    this.voices.add(source);
    source.onended = () => { this.voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
    source.start();
  };
  stop() {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    // Discard convolution tails on pause; enable() recreates the two room buses on resume.
    for (const bus of this.rooms) { bus.convolver.disconnect(); bus.output.disconnect(); }
    this.rooms.length = 0;
  }
  dispose() {
    this.stop(); void this.context?.close(); this.context = null;
    this.master = null; this.buffers.clear();
  }
}
