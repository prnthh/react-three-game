import { useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createParkourHUD, ParkourHUDContext } from '../hud';

export default function ParkourHUD({ children }: { children: ReactNode }) {
    const [store] = useState(createParkourHUD);
    return <ParkourHUDContext.Provider value={store}>
        {children}
        <Overlay store={store} />
    </ParkourHUDContext.Provider>;
}

function Overlay({ store }: { store: ReturnType<typeof createParkourHUD> }) {
    const telemetry = useStore(store, state => state.telemetry);
    if (!telemetry) return null;
    return <div data-parkour-hud style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', bottom: 24, left: 64, color: 'white', fontFamily: 'Arial, Helvetica, sans-serif', fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 3px #0008' }}>
            <div style={{ fontSize: 28, fontWeight: 600, fontStyle: 'italic', lineHeight: 1.2 }}>
                <span>{telemetry.speed.toFixed(1)} horizontal · {telemetry.verticalSpeed.toFixed(1)} vertical</span> <span style={{ fontSize: 16 }}>m/s</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 13 }}>{telemetry.status}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>T · Restart & replay last attempt</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>{telemetry.fps || '—'} FPS</div>
        </div>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', opacity: 0.7 }}>·</div>
    </div>;
}
