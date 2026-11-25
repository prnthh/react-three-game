import { useHelper } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { CameraHelper, DoubleSide, Quaternion, Vector3, type DirectionalLight, type SpotLight } from 'three';

/** Mounted beside the selected light after its ref has been attached. */
export function ShadowCameraHelper({ light }: { light: RefObject<DirectionalLight | SpotLight | null> }) {
    const camera = useMemo(() => ({ get current() { return light.current!.shadow.camera; } }), [light]);
    useHelper(camera, CameraHelper);
    return null;
}

export const MIN_SHADOW_MAP_SIZE = 64;
export const MAX_SHADOW_MAP_SIZE = 2048;

export const shadowDefaults = {
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowIntensity: 1,
    shadowRadius: 1,
    shadowAutoUpdate: true,
    shadowCameraNear: 0.5,
    shadowCameraFar: 500,
};

export const localLightDefaults = {
    color: '#ffffff', intensity: 1, distance: 0, decay: 2,
    ...shadowDefaults,
};

export const localLightProperties = {
    color: { type: 'color', default: localLightDefaults.color },
    intensity: { default: localLightDefaults.intensity, min: 0, step: 0.1 },
    distance: { description: "Light cutoff distance in scene units; 0 means no finite cutoff.", default: localLightDefaults.distance, min: 0, step: 1 },
    decay: { default: localLightDefaults.decay, min: 0, step: 0.1 },
    castShadow: { type: 'boolean', default: localLightDefaults.castShadow },
    shadowMapSize: { default: localLightDefaults.shadowMapSize, min: MIN_SHADOW_MAP_SIZE, max: MAX_SHADOW_MAP_SIZE, step: 128 },
    shadowBias: { default: localLightDefaults.shadowBias, min: -1, max: 1 },
    shadowNormalBias: { default: localLightDefaults.shadowNormalBias, min: -1, max: 1 },
    shadowIntensity: { default: localLightDefaults.shadowIntensity, min: 0, max: 1, step: 0.05 },
    shadowRadius: { default: localLightDefaults.shadowRadius, min: 0, step: 0.25 },
    shadowAutoUpdate: { type: 'boolean', default: localLightDefaults.shadowAutoUpdate },
    shadowCameraNear: { default: localLightDefaults.shadowCameraNear, min: 0.001, step: 0.1 },
    shadowCameraFar: { default: localLightDefaults.shadowCameraFar, min: 0.1, step: 1 },
} as const;

export function shadowProps(properties: typeof shadowDefaults) {
    return {
        castShadow: properties.castShadow,
        "shadow-bias": properties.shadowBias,
        "shadow-normalBias": properties.shadowNormalBias,
        "shadow-intensity": properties.shadowIntensity,
        "shadow-radius": properties.shadowRadius,
        "shadow-autoUpdate": properties.shadowAutoUpdate,
        "shadow-camera-near": properties.shadowCameraNear,
        "shadow-camera-far": properties.shadowCameraFar,
    };
}

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
        <group quaternion={orientation} userData={{ editorHelper: true }}>
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
    requestedSize: number,
) {
    const mapSize = normalizeShadowMapSize(requestedSize);
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
