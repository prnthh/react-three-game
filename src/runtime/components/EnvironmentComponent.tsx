import { AssetBoundary } from '../assets/AssetBoundary.js';
import { Environment } from '@react-three/drei';
import { createPortal, useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CubeCamera, HalfFloatType, Scene, type Mesh, type Texture } from 'three';
import { CubeRenderTarget } from 'three/webgpu';
import { MeshInstanceProvider } from '../rendering/MeshInstanceProvider.js';
import { usePrefabStoreApi } from '../prefabs/PrefabStoreContext.js';
import { ProgressiveMountProvider } from '../prefabs/ProgressiveMount.js';

import type { Component, ComponentViewProps } from '../../core/ComponentRegistry.js';

export type EnvironmentProperties = {
    intensity?: number;
    /** Capture count. Zero means continuous capture on the R3F render loop. */
    frames?: number;
    resolution?: number;
    background?: boolean;
    backgroundIntensity?: number;
    backgroundBlurriness?: number;
    environmentRotation?: [number, number, number];
    backgroundRotation?: [number, number, number];
};

/** Only the small capture scene is inspected; the main world is never traversed. */
function environmentSnapshot(scene: Scene): unknown[] {
    scene.updateMatrixWorld();
    const snapshot: unknown[] = [];
    scene.traverseVisible(object => {
        snapshot.push(object, object.layers.mask, ...object.matrixWorld.elements);
        const mesh = object as Mesh;
        if (mesh.geometry) snapshot.push(mesh.geometry, mesh.geometry.attributes.position);
        if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            snapshot.push(material, material.version, material.visible);
            for (const value of Object.values(material)) {
                if ((value as Texture)?.isTexture) snapshot.push(value, (value as Texture).version);
            }
        }
    });
    return snapshot;
}

function EnvironmentView({ properties, children }: ComponentViewProps<EnvironmentProperties>) {
    const store = usePrefabStoreApi();
    const { intensity, frames = 1, resolution = 256, ...props } = properties;
    const scene = useMemo(() => new Scene(), []);
    const capture = useMemo(() => {
        const target = new CubeRenderTarget(resolution, { type: HalfFloatType });
        return { target, camera: new CubeCamera(0.1, 1000, target), previous: [] as unknown[], remaining: 0 };
    }, [resolution]);
    useEffect(() => () => capture.target.dispose(), [capture]);
    useEffect(() => { capture.remaining = Math.max(1, frames); }, [capture, frames]);
    useFrame(({ gl }) => {
        const snapshot = environmentSnapshot(scene);
        if (snapshot.length !== capture.previous.length || snapshot.some((value, i) => value !== capture.previous[i])) {
            capture.previous = snapshot;
            capture.remaining = Math.max(1, frames);
        }
        if (frames !== 0 && capture.remaining <= 0) return;
        const autoClear = gl.autoClear;
        try {
            gl.autoClear = true;
            capture.camera.update(gl, scene);
            capture.remaining--;
        } finally { gl.autoClear = autoClear; }
    });
    return <>
        <Environment {...props} map={capture.target.texture} environmentIntensity={intensity} />
        {createPortal(<AssetBoundary atomic subscribeToRetry={store.subscribe}>
            <ProgressiveMountProvider batchSize={0}>
                <MeshInstanceProvider isolated enabled={false}>{children}</MeshInstanceProvider>
            </ProgressiveMountProvider>
        </AssetBoundary>, scene)}
    </>;
}

const EnvironmentComponent: Component<EnvironmentProperties> = {
    name: 'Environment',
    renderWhenDisabled: true,
    description: "Capture child objects as the scene lighting/reflection environment. For an image, add a child sphere with a basic BackSide image material. background also displays the captured map.",
    slot: 'environment',
    View: EnvironmentView,
    properties: {
        intensity: { default: 1, min: 0, step: 0.1 },
        frames: { default: 1, min: 0, step: 1, description: "Capture count. 0 captures on every R3F frame; 1 captures once per children update." },
        resolution: { description: "Cube-map face resolution in pixels.", default: 256, min: 64, step: 64 },
        background: { type: 'boolean', default: true },
        backgroundIntensity: { default: 1, min: 0, step: 0.1 },
        backgroundBlurriness: { default: 0, min: 0, max: 1, step: 0.05 },
        environmentRotation: { description: "XYZ Euler radians rotating the lighting/reflection map.", type: 'vector3', default: [0, 0, 0] },
        backgroundRotation: { description: "XYZ Euler radians rotating the visible background map.", type: 'vector3', default: [0, 0, 0] },
    },
};

export default EnvironmentComponent;
