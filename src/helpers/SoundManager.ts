export type SoundOptions = {
  volume?: number;
  playbackRate?: number;
  detune?: number;
  pitch?: number;
  onEnded?: () => void;
};

export interface SoundPlayback { stop(): void; }

/** One shared context: resuming any sound also resumes queued background music. */
export class SoundManager {
  private audioContext?: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<void>>();
  private masterGain?: GainNode;
  private sfxGain?: GainNode;
  private musicGain?: GainNode;
  private music?: SoundPlayback;
  private musicRequest = 0;

  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}

  get context() {
    if (!this.audioContext) {
      const context = this.createContext();
      this.audioContext = context;
      this.masterGain = context.createGain();
      this.sfxGain = context.createGain();
      this.musicGain = context.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(context.destination);
    }
    return this.audioContext;
  }

  get isRunning() { return this.audioContext?.state === 'running'; }

  /** Call directly in the interaction handler, before fetching/awaiting audio. */
  resume(): Promise<boolean> {
    const context = this.context;
    if (context.state === 'running') return Promise.resolve(true);
    return context.resume().then(() => context.state === 'running', () => false);
  }

  async load(path: string, url = path): Promise<void> {
    if (this.buffers.has(path)) return;
    const existing = this.loading.get(path);
    if (existing) return existing;
    const context = this.context;
    const request = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load sound: ${url} (${response.status})`);
      this.buffers.set(path, await context.decodeAudioData(await response.arrayBuffer()));
    })();
    this.loading.set(path, request);
    try { await request; } finally { this.loading.delete(path); }
  }

  private start(buffer: AudioBuffer, bus: GainNode, loop: boolean, options: SoundOptions): SoundPlayback {
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = (options.playbackRate ?? 1) * (options.pitch ?? 1);
    source.detune.value = options.detune ?? 0;
    gain.gain.value = options.volume ?? 1;
    source.connect(gain);
    gain.connect(bus);
    let stopped = false;
    const cleanup = () => { source.disconnect(); gain.disconnect(); };
    source.onended = () => {
      if (stopped) return;
      stopped = true;
      cleanup();
      options.onEnded?.();
    };
    source.start(); // A suspended context queues this until a user gesture resumes it.
    return { stop() {
      if (stopped) return;
      stopped = true;
      source.onended = null;
      source.stop();
      cleanup();
    } };
  }

  playSync(path: string, options: SoundOptions = {}): SoundPlayback | undefined {
    void this.resume();
    const buffer = this.buffers.get(path);
    return buffer ? this.start(buffer, this.sfxGain!, false, options) : undefined;
  }

  async play(path: string, options: SoundOptions = {}): Promise<SoundPlayback> {
    void this.resume(); // Preserve the user gesture even when the clip is not cached.
    await this.load(path);
    return this.start(this.buffers.get(path)!, this.sfxGain!, false, options);
  }

  async playMusic(path: string, options: SoundOptions = {}): Promise<void> {
    void this.resume();
    const request = ++this.musicRequest;
    await this.load(path);
    if (request !== this.musicRequest) return;
    this.music?.stop();
    this.music = this.start(this.buffers.get(path)!, this.musicGain!, true, options);
  }

  stopMusic() { this.musicRequest++; this.music?.stop(); this.music = undefined; }
  hasBuffer(path: string) { return this.buffers.has(path); }
  setBuffer(path: string, buffer: AudioBuffer) { this.buffers.set(path, buffer); }
  removeBuffer(path: string, expected: AudioBuffer) {
    if (this.buffers.get(path) === expected) this.buffers.delete(path);
  }
  setMasterVolume(value: number) { void this.context; this.masterGain!.gain.value = value; }
  setSfxVolume(value: number) { void this.context; this.sfxGain!.gain.value = value; }
  setMusicVolume(value: number) { void this.context; this.musicGain!.gain.value = value; }
}

// Lazy initialization keeps imports safe during SSR and avoids unused contexts.
export const sound = new SoundManager();
