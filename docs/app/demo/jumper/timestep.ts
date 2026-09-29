import { createJumperState, stepJumper, type Position } from './movement';

export const JUMPER_STEP = 1 / 120;
export function createJumperSimulation(position: Position) {
    const current = createJumperState(position);
    return { current, previous: current, remainder: 0 };
}
export type JumperSimulation = ReturnType<typeof createJumperSimulation>;

/** Fixed simulation, interpolated presentation; cap catch-up after a suspended frame. */
export function advanceJumper(sim: JumperSimulation, delta: number,
    input: Parameters<typeof stepJumper>[1], settings: Parameters<typeof stepJumper>[2],
    surfaces: Parameters<typeof stepJumper>[3]) {
    sim.remainder += Math.min(Math.max(delta, 0), 0.1);
    let steps = 0;
    while (sim.remainder + 1e-12 >= JUMPER_STEP) {
        sim.previous = sim.current;
        sim.current = stepJumper(sim.current, { ...input, jump: input.jump && steps === 0 }, settings, surfaces, JUMPER_STEP);
        sim.remainder = Math.max(0, sim.remainder - JUMPER_STEP);
        steps++;
    }
    return steps;
}

export function jumperRenderPosition(sim: JumperSimulation): Position {
    const alpha = sim.remainder / JUMPER_STEP;
    return sim.current.position.map((value, i) => sim.previous.position[i] + (value - sim.previous.position[i]) * alpha) as Position;
}
