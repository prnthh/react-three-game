import { createJumperState, stepJumper } from './movement';
import type { Position } from './collision';

export const JUMPER_STEP = 1 / 120;
export function createJumperSimulation(position: Position) {
    const current = createJumperState(position);
    return { current, previous: current, remainder: 0 };
}
export type JumperSimulation = ReturnType<typeof createJumperSimulation>;

/** Fixed simulation, interpolated presentation; cap catch-up after a suspended frame. */
export function advanceJumper(simulation: JumperSimulation, frameDelta: number,
    input: Parameters<typeof stepJumper>[1], settings: Parameters<typeof stepJumper>[2],
    surfaces: Parameters<typeof stepJumper>[3], onStep?: (input: Parameters<typeof stepJumper>[1]) => void) {
    simulation.remainder += Math.min(Math.max(frameDelta, 0), 0.1);
    let steps = 0;
    while (simulation.remainder + 1e-12 >= JUMPER_STEP) {
        simulation.previous = simulation.current;
        const command = { ...input, jump: input.jump && steps === 0 };
        simulation.current = stepJumper(simulation.current, command, settings, surfaces, JUMPER_STEP);
        onStep?.(command);
        simulation.remainder = Math.max(0, simulation.remainder - JUMPER_STEP);
        steps++;
    }
    return steps;
}

export function jumperRenderPosition(simulation: JumperSimulation): Position {
    const interpolationFraction = simulation.remainder / JUMPER_STEP;
    return simulation.current.position.map((value, i) => simulation.previous.position[i] + (value - simulation.previous.position[i]) * interpolationFraction) as Position;
}
