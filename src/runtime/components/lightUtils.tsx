import { useLayoutEffect, useRef, type RefObject } from 'react';
import { DoubleSide } from 'three';

export const MIN_SHADOW_MAP_SIZE = 64;
export const MAX_SHADOW_MAP_SIZE = 2048;

/** A small, raycastable Unity-style scene gizmo for otherwise invisible lights. */
export function EditorLightGizmo({
    color,
    selected = false,
}: {
    color: string;
    selected?: boolean;
}) {
    return (
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
        map: { dispose(): void } | null;
        mapPass?: { dispose(): void } | null;
        mapSize: { set(width: number, height: number): unknown };
        needsUpdate: boolean;
    };
}

/** Recreate an expensive shadow target only after an authored value is committed. */
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

        const replacingTarget = applied.current?.owner === owner;
        applied.current = { owner, size: mapSize };
        shadow.mapSize.set(mapSize, mapSize);

        if (replacingTarget) {
            shadow.map?.dispose();
            shadow.map = null;
            shadow.mapPass?.dispose();
            shadow.mapPass = null;
        }

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
