import type { SoundManager, SoundPlayback } from 'react-three-game/viewer';
import type { Point, Script } from './script';
export interface Actor {
    position(): Point;
    place(position: Point): void;
    face(position: Point): void;
    animate(name: string): void;
    update(delta: number): void;
    reset(): void;
}
export type AudioState = 'on' | 'muted' | 'blocked';
export type Caption = { character?: string; text: string } | null;

/** Executes commands in order. Only dialogue and walkto wait before advancing. */
export class Runner {
    private index = 0;
    private started = false;
    private elapsed = 0;
    private audio: SoundPlayback | null = null;
    private audioActive = false;
    private voiceRequest = 0;
    private audioDone = false;
    private disposed = false;
    private muted = false;
    audioState: AudioState = 'on';
    constructor(private script: Script, private actors: Record<string, Actor>, private sound: Pick<SoundManager, 'play' | 'resume' | 'isRunning' | 'setMasterVolume'>, private caption: (value: Caption) => void, private loop = true, private focus: (character: string | null) => void = () => {}, private onAudioState: (state: AudioState) => void = () => {}, private resolveAudioSrc: (src: string) => string = src => src) {}

    private reportAudio(state: AudioState) {
        if (this.audioState === state) return;
        this.audioState = state;
        this.onAudioState(state);
    }
    setAudioEnabled(enabled: boolean) {
        this.muted = !enabled;
        this.sound.setMasterVolume(enabled ? 1 : 0);
        void this.sound.resume();
        this.reportAudio(!enabled ? 'muted' : this.sound.isRunning ? 'on' : 'blocked');
    }
    private stopAudio() {
        this.voiceRequest++;
        this.audio?.stop();
        this.audio = null;
    }
    private startDialogue(command: Extract<Script[number], { type: 'dialogue' }>) {
        this.focus(command.closeup ? command.character : null);
        this.caption({ character: command.character, text: command.text });
        if (!command.audioSrc) return;
        const request = ++this.voiceRequest;
        this.audioActive = true;
        void this.sound.play(this.resolveAudioSrc(command.audioSrc), {
            onEnded: () => { if (request === this.voiceRequest) this.audioDone = true; },
        }).then(audio => {
            if (request !== this.voiceRequest || this.disposed) { audio.stop(); return; }
            this.audio = audio;
        }).catch(() => {
            if (request === this.voiceRequest && !this.disposed) this.audioActive = false;
        });
    }
    private next() {
        if (this.script[this.index].type === 'dialogue') { this.focus(null); this.caption(null); }
        this.stopAudio();
        this.index++;
        this.started = false;
        this.elapsed = 0;
        this.audioActive = false;
        this.audioDone = false;
    }
    tick(delta: number) {
        if (this.disposed) return;
        this.reportAudio(this.muted ? 'muted' : this.sound.isRunning ? 'on' : 'blocked');
        const dt = Math.max(0, Math.min(delta, 0.1));
        // Bound immediate commands so even a script with no waits cannot spin.
        for (let count = 0; count < this.script.length; count++) {
            if (this.index === this.script.length) {
                if (!this.loop) return;
                Object.values(this.actors).forEach(actor => actor.reset());
                this.index = 0;
                break;
            }
            const command = this.script[this.index];
            const actor = this.actors[command.character];
            if (!this.started) {
                this.started = true;
                if (command.type === 'animation') actor.animate(command.name);
                if (command.type === 'lookat') actor.face(typeof command.target === 'string' ? this.actors[command.target].position() : command.target);
                if (command.type === 'dialogue') this.startDialogue(command);
            }
            if (command.type === 'animation' || command.type === 'lookat') { this.next(); continue; }
            if (command.type === 'walkto') {
                const p = actor.position();
                const distance = Math.hypot(...p.map((n, i) => command.position[i] - n));
                const step = Math.min(distance, (command.speed ?? 1.2) * dt);
                actor.face(command.position);
                if (distance <= step + 0.001) { actor.place(command.position); this.next(); }
                else actor.place(p.map((n, i) => n + (command.position[i] - n) * step / distance) as Point);
            } else {
                this.elapsed += dt * 1000;
                const duration = command.durationMs ?? Math.max(2000, command.text.length * 55);
                if (this.audioActive ? this.audioDone : this.elapsed >= duration) this.next();
            }
            break;
        }
        Object.values(this.actors).forEach(actor => actor.update(dt));
    }
    dispose() {
        this.disposed = true;
        this.focus(null);
        this.stopAudio();
        Object.values(this.actors).forEach(actor => actor.reset());
        this.caption(null);
    }
}
