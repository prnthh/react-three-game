 
class SoundManager {
  private static _instance: SoundManager | null = null

  public context: AudioContext
  private buffers = new Map<string, AudioBuffer>()

  private masterGain: GainNode
  private sfxGain: GainNode
  private musicGain: GainNode

  private constructor() {
    const AudioCtx =
      window.AudioContext || (window as any).webkitAudioContext

    this.context = new AudioCtx()

    this.masterGain = this.context.createGain()
    this.sfxGain = this.context.createGain()
    this.musicGain = this.context.createGain()

    this.sfxGain.connect(this.masterGain)
    this.musicGain.connect(this.masterGain)
    this.masterGain.connect(this.context.destination)

    this.masterGain.gain.value = 1
    this.sfxGain.gain.value = 1
    this.musicGain.gain.value = 1
  }

  /** Singleton accessor */
  static get instance(): SoundManager {
    if (typeof window === 'undefined') {
      // Return a dummy instance for SSR
      return new Proxy({} as SoundManager, {
        get: () => () => {}
      })
    }
    if (!SoundManager._instance) {
      SoundManager._instance = new SoundManager()
    }
    return SoundManager._instance
  }

  /** Required once after user gesture (browser) */
  resume() {
    if (this.context.state !== "running") {
      this.context.resume()
    }
  }

  /** Preload a sound from URL */
  async load(path: string, url: string) {
    if (this.buffers.has(path)) return

    const res = await fetch(url)
    const arrayBuffer = await res.arrayBuffer()
    const buffer = await this.context.decodeAudioData(arrayBuffer)

    this.buffers.set(path, buffer)
  }

  /** Play from already-loaded buffer (fails silently if not loaded) */
  playSync(
    path: string,
    {
      volume = 1,
      playbackRate = 1,
      detune = 0,
      pitch = 1,
    }: {
      volume?: number
      playbackRate?: number
      detune?: number
      pitch?: number
    } = {}
  ) {
    this.resume()

    const buffer = this.buffers.get(path)
    if (!buffer) return

    const src = this.context.createBufferSource()
    const gain = this.context.createGain()

    src.buffer = buffer
    src.playbackRate.value = playbackRate * pitch
    src.detune.value = detune

    gain.gain.value = volume

    src.connect(gain)
    gain.connect(this.sfxGain)

    src.start()
  }

  /** Load and play SFX - accepts file path directly */
  async play(
    path: string,
    options?: {
      volume?: number
      playbackRate?: number
      detune?: number
      pitch?: number
    }
  ) {
    // Auto-load from path if not already loaded
    if (!this.buffers.has(path)) {
      await this.load(path, path)
    }

    this.playSync(path, options)
  }

  /** Volume controls */
  setMasterVolume(v: number) {
    this.masterGain.gain.value = v
  }

  setSfxVolume(v: number) {
    this.sfxGain.gain.value = v
  }

  setMusicVolume(v: number) {
    this.musicGain.gain.value = v
  }
}

export const sound = SoundManager.instance
