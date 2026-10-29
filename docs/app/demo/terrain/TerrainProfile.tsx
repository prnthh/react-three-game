'use client';

import { getTerrainPhysicsStatus } from 'react-three-game/plugins/crashcat';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Opt-in benchmark readout. Samples frame intervals, not GPU execution time. */
export function TerrainProfile({ output }: { output: RefObject<HTMLOutputElement | null> }) {
    const gl = useThree(state => state.gl);
    useEffect(() => {
        const previous = gl.info.autoReset;
        gl.info.autoReset = false;
        return () => { gl.info.autoReset = previous; gl.info.reset(); };
    }, [gl]);
    const samples = useRef<number[]>([]);
    const warmup = useRef(120);
    useFrame(({ gl, scene }, delta) => {
        if (warmup.current-- > 0 || document.hidden) { gl.info.reset(); return; }
        samples.current.push(delta * 1000);
        if (samples.current.length < 180) { gl.info.reset(); return; }
        const values = samples.current.sort((a, b) => a - b);
        const info = gl.info as unknown as { render: { drawCalls?: number; calls: number; triangles: number }; memory: { geometries: number; textures: number; total?: number } };
        if (output.current) output.current.textContent = JSON.stringify({
            physics: getTerrainPhysicsStatus(scene),
            medianMs: +values[90].toFixed(2), p95Ms: +values[171].toFixed(2),
            draws: info.render.drawCalls ?? info.render.calls, triangles: info.render.triangles,
            geometries: info.memory.geometries, textures: info.memory.textures,
            gpuResourceMB: info.memory.total == null ? null : +(info.memory.total / 1048576).toFixed(1),
        });
        samples.current = [];
        gl.info.reset();
    });
    return null;
}
