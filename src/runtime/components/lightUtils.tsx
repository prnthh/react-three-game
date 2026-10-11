import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DoubleSide, Quaternion, Vector3 } from 'three';

export const MIN_SHADOW_MAP_SIZE = 64;
export const MAX_SHADOW_MAP_SIZE = 2048;

export function createFollowState() {
    return { elapsed: 0, x: NaN, z: NaN };
}

/** Sample once per interval, then quantize space; never run catch-up updates. */
export function stepCameraFollow(state: ReturnType<typeof createFollowState>, delta: number,
    x: number, z: number, interval: number, grid: number) {
    state.elapsed += delta;
    if (Number.isFinite(state.x) && state.elapsed < interval) return false;
    state.elapsed %= interval;
    const nextX = Math.round(x / grid) * grid, nextZ = Math.round(z / grid) * grid;
    if (state.x === nextX && state.z === nextZ) return false;
    state.x = nextX;
    state.z = nextZ;
    return true;
}

/** A small, raycastable Unity-style scene gizmo for otherwise invisible lights. */
export function EditorLightGizmo({
    color,
    selected = false,
    targetOffset = [0, -1, 0],
}: {
    color: string;
    selected?: boolean;
    targetOffset?: [number, number, number];
}) {
    // The target is local to the node; its transform rotates both the light and this guide.
    const orientation = new Quaternion().setFromUnitVectors(
        new Vector3(0, -1, 0), new Vector3(...targetOffset).normalize(),
    );
    return (
        <group quaternion={orientation}>
            <mesh
                position={[0, -0.22, 0]}
                renderOrder={10_000}
            >
                <coneGeometry args={[0.36, 0.72, 12, 1, true]} />
                <meshBasicMaterial
                    color={selected ? '#ffffff' : color}
                    depthTest={false}
                    depthWrite={false}
                    opacity={selected ? 0.95 : 0.62}
                    side={DoubleSide}
                    toneMapped={false}
                    transparent
                    wireframe
                />
            </mesh>
        </group>
    );
}

export function normalizeShadowMapSize(value: unknown, fallback = 512) {
    const numericValue = Number(value);
    const finiteValue = Number.isFinite(numericValue) ? numericValue : fallback;
    const clampedValue = Math.min(MAX_SHADOW_MAP_SIZE, Math.max(MIN_SHADOW_MAP_SIZE, finiteValue));
    return Math.round(clampedValue / 128) * 128;
}

interface ShadowMapOwner {
    shadow: {
        mapSize: { set(width: number, height: number): unknown };
        needsUpdate: boolean;
    };
}

/** Let the renderer resize its own shadow target after the authored value commits. */
export function useShadowMapResolution<T extends ShadowMapOwner>(
    lightRef: RefObject<T | null>,
    mapSize: number,
) {
    const applied = useRef<{ owner: T; size: number } | null>(null);

    useLayoutEffect(() => {
        const owner = lightRef.current;
        if (!owner) return;
        const shadow = owner.shadow;
        if (applied.current?.owner === owner && applied.current.size === mapSize) return;

        applied.current = { owner, size: mapSize };
        shadow.mapSize.set(mapSize, mapSize);

        shadow.needsUpdate = true;
    });
}

export function mergeWithDefaults<T extends Record<string, any>>(
    defaults: T,
    properties?: Partial<NoInfer<T>> | null,
): T {
    const merged = { ...defaults };

    if (!properties) {
        return merged;
    }

    for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined) {
            (merged as Record<string, any>)[key] = value;
        }
    }

    return merged;
}
