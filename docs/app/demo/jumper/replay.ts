import { SurfaceGrid } from './spatial';
import { createJumperSimulation, JUMPER_STEP, stepJumper,
    type JumperSimulation, type MovementSettings, type Position, type Surface } from './movement';

export type JumperCommand = Required<Parameters<typeof stepJumper>[1]>;
const idle = (): JumperCommand => ({ x: 0, z: 0, facingX: 0, facingZ: -1, jump: false, crouch: false });
const fields = ['x', 'z', 'facingX', 'facingZ', 'jump', 'crouch'] as const;
export type Attempt = {
    spawn: Position;
    settings: MovementSettings;
    surfaces: Surface[];
    ticks: number;
    changes: { tick: number; delta: Partial<JumperCommand> }[];
};
export function createAttempt(spawn: Position, settings: MovementSettings, surfaces: Surface[]): Attempt {
    return { spawn: [...spawn], settings: { ...settings }, surfaces: structuredClone(surfaces), ticks: 0, changes: [] };
}
// Runtime acceleration stays outside the serializable recording. Live and ghost
// share an index when using the same immutable attempt snapshot.
const collisionGrids = new WeakMap<Attempt, SurfaceGrid>();
export function attemptCollision(attempt: Attempt) {
    let grid = collisionGrids.get(attempt);
    if (!grid) { grid = new SurfaceGrid(attempt.surfaces); collisionGrids.set(attempt, grid); }
    return grid;
}

export function createRecorder(attempt: Attempt) {
    let previous = idle();
    return (input: Parameters<typeof stepJumper>[1]) => {
        const command: JumperCommand = { ...idle(), ...input, crouch: !!input.crouch };
        const delta: Partial<JumperCommand> = {};
        for (const field of fields) {
            if (command[field] !== previous[field]) Object.assign(delta, { [field]: command[field] });
        }
        if (Object.keys(delta).length) attempt.changes.push({ tick: attempt.ticks, delta });
        previous = command;
        attempt.ticks++;
    };
}
export type Replay = {
    attempt: Attempt; simulation: JumperSimulation; tick: number; cursor: number; command: JumperCommand;
};
export function createReplay(attempt: Attempt): Replay {
    return { attempt, simulation: createJumperSimulation(attempt.spawn), tick: 0, cursor: 0, command: idle() };
}
/** Consume exactly one recorded physics command per live physics step. No frame clock drift. */
export function stepReplay(replay: Replay) {
    if (replay.tick >= replay.attempt.ticks) return false;
    const change = replay.attempt.changes[replay.cursor];
    if (change?.tick === replay.tick) {
        Object.assign(replay.command, change.delta);
        replay.cursor++;
    }
    const sim = replay.simulation;
    sim.previous = sim.current;
    sim.current = stepJumper(sim.current, replay.command, replay.attempt.settings, attemptCollision(replay.attempt), JUMPER_STEP);
    replay.tick++;
    return true;
}
