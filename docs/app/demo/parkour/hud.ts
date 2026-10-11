import { createContext, useContext } from 'react';
import { createStore } from 'zustand/vanilla';

export type ParkourTelemetry = { speed: number; verticalSpeed: number; status: string; fps: number };
const initial: ParkourTelemetry = { speed: 0, verticalSpeed: 0, status: 'Airborne', fps: 0 };

/** One page owns the display; a mounted controller leases its telemetry channel. */
export function createParkourHUD() {
    const store = createStore<{ telemetry: ParkourTelemetry | null }>(() => ({ telemetry: null }));
    let owner: symbol | null = null;
    return Object.assign(store, {
        connect() {
            const token = Symbol();
            owner = token;
            store.setState({ telemetry: initial });
            return {
                publish(telemetry: ParkourTelemetry) {
                    if (owner === token) store.setState({ telemetry });
                },
                dispose() {
                    if (owner !== token) return;
                    owner = null;
                    store.setState({ telemetry: null });
                },
            };
        },
    });
}
export const ParkourHUDContext = createContext<ReturnType<typeof createParkourHUD> | null>(null);
export const useParkourHUD = () => useContext(ParkourHUDContext);
