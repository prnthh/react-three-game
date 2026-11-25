'use client';

import { useCallback, useState, type ReactNode } from 'react';
import DemoApp from './DemoApp';
import type { FrameSample } from './FrameSampler';

const windowMs = 15_000;

export default function HomeHero({ children }: { children: ReactNode }) {
    const [panels, setPanels] = useState(true);
    const [graph, setGraph] = useState(false);
    const [samples, setSamples] = useState<FrameSample[]>([]);
    const record = useCallback((sample: FrameSample) => {
        setSamples(previous => [...previous.filter(p => p.time > sample.time - windowMs), sample]);
    }, []);

    return <main className="relative isolate flex h-screen w-full flex-col items-center justify-center px-4 text-zinc-900">
        <div className="absolute right-3 top-3 z-50 flex items-start gap-2 sm:right-5 sm:top-5">
            <button type="button" className="metal-button px-3" aria-controls="home-panels" aria-pressed={!panels}
                onClick={() => setPanels(!panels)}>{panels ? 'Hide UI' : 'Show UI'}</button>
            <button type="button" aria-expanded={graph} aria-label={graph ? 'Close performance graph' : 'Open performance graph'}
                onClick={() => { setGraph(!graph); setSamples([]); }}
                className={graph ? 'metal-terminal w-48 max-w-[60vw] px-3 py-2 text-left' : 'metal-button px-3'}>
                {graph ? <FrameGraph samples={samples} /> : 'Perf'}
            </button>
        </div>
        <div id="home-panels" hidden={!panels}>{children}</div>
        <DemoApp onFrameSample={graph ? record : undefined} />
    </main>;
}

function FrameGraph({ samples }: { samples: FrameSample[] }) {
    const last = samples.at(-1);
    const scale = Math.max(16.7, ...samples.map(s => Math.max(s.cpu, s.gpu ?? 0)));
    const line = (key: 'cpu' | 'gpu') => {
        let path = '', move = true;
        for (const sample of samples) {
            const value = sample[key];
            if (value === undefined) { move = true; continue; }
            const x = 160 * (1 - ((last?.time ?? 0) - sample.time) / windowMs);
            path += `${move ? 'M' : 'L'}${x.toFixed(1)} ${(38 - 36 * value / scale).toFixed(1)} `;
            move = false;
        }
        return path;
    };
    return <span className="relative block font-mono text-[11px] leading-tight tabular-nums">
        <span className="flex justify-between text-zinc-300"><span>Frame time</span><span>15 s</span></span>
        <svg viewBox="0 0 160 40" className="my-1 block w-full" aria-hidden="true">
            <path d="M0 2H160 M0 20H160 M0 38H160" stroke="#38404a" strokeWidth=".6" />
            <path d={line('cpu')} fill="none" stroke="#67e8f9" strokeWidth="1.6" />
            <path d={line('gpu')} fill="none" stroke="#fbbf24" strokeWidth="1.6" />
        </svg>
        <span className="flex justify-between gap-2"><span className="text-cyan-300">CPU {last ? last.cpu.toFixed(1) + ' ms' : '…'}</span>
            <span className="text-amber-300">GPU {last?.gpu !== undefined ? last.gpu.toFixed(1) + ' ms' : last ? 'n/a' : '…'}</span></span>
    </span>;
}
