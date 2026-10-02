import { SurfaceGrid } from './spatial';
import { createJumperSimulation, JUMPER_STEP, stepJumper,
    type MovementSettings, type Position, type Surface } from './movement';

export const Buttons = { forward: 1, back: 2, left: 4, right: 8, jump: 16, crouch: 32 } as const;
const TAU = Math.PI * 2;
const YAW_STEPS = 65536;

/** Quantize before simulation: live physics and replay consume the same command. */
export function packCommand(buttons: number, yaw: number) {
    const angle = Math.round(((yaw % TAU + TAU) % TAU) * YAW_STEPS / TAU) & 0xffff;
    return (angle << 6) | (buttons & 63);
}
export function unpackCommand(packed: number) {
    const yaw = (packed >>> 6) * TAU / YAW_STEPS;
    const facingX = -Math.sin(yaw), facingZ = -Math.cos(yaw);
    const ahead = Number(!!(packed & Buttons.forward)) - Number(!!(packed & Buttons.back));
    const right = Number(!!(packed & Buttons.right)) - Number(!!(packed & Buttons.left));
    return { x: facingX * ahead - facingZ * right, z: facingZ * ahead + facingX * right,
        facingX, facingZ, jump: !!(packed & Buttons.jump), crouch: !!(packed & Buttons.crouch) };
}

/** One packed command per tick. Capacity doubles as needed. */
export class Recording {
    ticks = 0;
    private commands = new Uint32Array(4096);
    private finished = false;

    append(packed: number) {
        if (this.finished) throw new Error('Cannot append to a finished recording');
        if (this.ticks === this.commands.length) {
            const larger = new Uint32Array(this.commands.length * 2);
            larger.set(this.commands);
            this.commands = larger;
        }
        this.commands[this.ticks++] = packed;
    }
    finish() {
        if (!this.finished) {
            this.commands = this.commands.slice(0, this.ticks);
            this.finished = true;
        }
        return this.commands;
    }
}

export function createAttempt(spawn: Position, settings: MovementSettings, surfaces: Surface[]) {
    return { spawn: [...spawn] as Position, settings: { ...settings }, surfaces: structuredClone(surfaces), recording: new Recording() };
}
export type Attempt = ReturnType<typeof createAttempt>;
const collisionGrids = new WeakMap<Attempt, SurfaceGrid>();
export function attemptCollision(attempt: Attempt) {
    let grid = collisionGrids.get(attempt);
    if (!grid) { grid = new SurfaceGrid(attempt.surfaces); collisionGrids.set(attempt, grid); }
    return grid;
}

/** Playback indexes the finished commands directly, once per live physics tick. */
export class Replay {
    readonly simulation;
    tick = 0;
    command = unpackCommand(0);
    private readonly commands;

    constructor(readonly attempt: Attempt) {
        this.simulation = createJumperSimulation(attempt.spawn);
        this.commands = attempt.recording.finish();
    }
    step() {
        if (this.tick >= this.commands.length) return false;
        this.command = unpackCommand(this.commands[this.tick++]);
        const sim = this.simulation;
        sim.previous = sim.current;
        sim.current = stepJumper(sim.current, this.command, this.attempt.settings, attemptCollision(this.attempt), JUMPER_STEP);
        return true;
    }
}
