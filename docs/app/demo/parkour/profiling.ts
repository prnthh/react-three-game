import { createContext } from 'react';

export function createParkourProfile() {
    let ticks = 0, replayTicks = 0, simulationMs = 0, peakSimulationMs = 0;
    return {
        sample(steps: number, replaySteps: number, elapsed: number) {
            ticks += steps;
            replayTicks += replaySteps;
            simulationMs += elapsed;
            peakSimulationMs = Math.max(peakSimulationMs, elapsed);
        },
        read() {
            const details = { ticks, replayTicks, simulationMs, peakSimulationMs };
            ticks = replayTicks = simulationMs = peakSimulationMs = 0;
            return details;
        },
    };
}
export const ParkourProfile = createContext<ReturnType<typeof createParkourProfile> | null>(null);
