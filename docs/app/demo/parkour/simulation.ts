import { createParkourState, stepParkour } from './movement';
import type { Position } from './collision';

export const PARKOUR_STEP = 1 / 120;
export function createParkourSimulation(position: Position) {
    const current = createParkourState(position);
    return { current, previous: current, remainder: 0 };
}
export type ParkourSimulation = ReturnType<typeof createParkourSimulation>;

/** Fixed simulation, interpolated presentation; cap catch-up after a suspended frame. */
export function advanceParkour(simulation: ParkourSimulation, frameDelta: number,
    input: Parameters<typeof stepParkour>[1], settings: Parameters<typeof stepParkour>[2],
    surfaces: Parameters<typeof stepParkour>[3], onStep?: (input: Parameters<typeof stepParkour>[1]) => void) {
    simulation.remainder += Math.min(Math.max(frameDelta, 0), 0.1);
    let steps = 0;
    while (simulation.remainder + 1e-12 >= PARKOUR_STEP) {
        simulation.previous = simulation.current;
        const command = { ...input, jump: input.jump && steps === 0 };
        simulation.current = stepParkour(simulation.current, command, settings, surfaces, PARKOUR_STEP);
        onStep?.(command);
        simulation.remainder = Math.max(0, simulation.remainder - PARKOUR_STEP);
        steps++;
    }
    return steps;
}

export function parkourRenderPosition(simulation: ParkourSimulation): Position {
    const interpolationFraction = simulation.remainder / PARKOUR_STEP;
    return simulation.current.position.map((value, i) => simulation.previous.position[i] + (value - simulation.previous.position[i]) * interpolationFraction) as Position;
}
