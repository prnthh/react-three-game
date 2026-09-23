import type { Point, Script } from './script';
export interface Actor {
    position(): Point;
    place(position: Point): void;
    face(position: Point): void;
    animate(name: string): void;
    update(delta: number): void;
    reset(): void;
}
export type Caption = { character?: string; text: string } | null;

/** Executes commands in order. Only dialogue and walkto wait before advancing. */
export class Runner {
    private index = 0;
    private started = false;
    private elapsed = 0;
    private audio: HTMLAudioElement | null = null;
    private audioActive = false;
    private audioDone = false;
    private disposed = false;
    constructor(private script: Script, private actors: Record<string, Actor>, private makeAudio: (src: string) => HTMLAudioElement, private caption: (value: Caption) => void, private loop = true, private focus: (character: string | null) => void = () => {}) {}

    private stopAudio() {
        if (!this.audio) return;
        this.audio.pause();
        this.audio.onended = this.audio.onerror = this.audio.onplaying = null;
        this.audio.removeAttribute('src');
        this.audio.load();
        this.audio = null;
    }
    private startDialogue(command: Extract<Script[number], { type: 'dialogue' }>) {
        this.focus(command.closeup ? command.character : null);
        this.caption({ character: command.character, text: command.text });
        if (!command.audioSrc) return;
        const audio = this.makeAudio(command.audioSrc);
        this.audio = audio;
        audio.onplaying = () => { this.audioActive = true; };
        audio.onended = () => { this.audioDone = true; };
        audio.onerror = () => { this.audioActive = false; audio.pause(); };
        void audio.play().catch(() => {
            if (this.audio === audio && !this.disposed) this.audioActive = false;
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
