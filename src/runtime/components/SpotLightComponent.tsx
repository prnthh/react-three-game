import type { Component, ComponentViewProps } from "../../core/ComponentRegistry.js";

import { Helper } from "@react-three/drei";

import { useMemo, useRef } from "react";

import { Object3D, SpotLightHelper } from "three";

import type { SpotLight } from "three";

import { AssetBoundary } from "../assets/AssetBoundary.js";
import { usePrefabStoreApi } from "../prefabs/PrefabStoreContext.js";
import { useTextureAsset } from "../assets/AssetRuntime.js";

import { useNode } from "../scene/SceneContext.js";

import { usePrefab } from "../scene/SceneContext.js";

import { EditorLightGizmo, ShadowCameraHelper, localLightDefaults, localLightProperties, shadowProps, useShadowMapResolution } from "./lightUtils.js";

import { withBasePath } from "../assets/assetPaths.js";

export const spotLightDefaults = {
    ...localLightDefaults,
    angle: Math.PI / 3,
    penumbra: 0,
    targetOffset: [0, -5, 0] as [number, number, number],
    map: undefined as string | undefined,
};

export type SpotLightProperties = Partial<typeof spotLightDefaults>;

function SpotLightMap({ path }: { path: string }) {
    const texture = useTextureAsset(path);
    return texture && <primitive object={texture} attach="map" />;
}

function SpotLightView({ properties, children }: ComponentViewProps<SpotLightProperties>) {
    const editMode = useNode(node => node.editMode);
    const isSelected = useNode(node => node.isSelected);
    const { basePath } = usePrefab();


    const resolvedMap = properties.map ? withBasePath(basePath, properties.map) : properties.map;
    const store = usePrefabStoreApi();

    const lightProps = {
        color: properties.color,
        intensity: properties.intensity,
        angle: properties.angle,
        penumbra: properties.penumbra,
        distance: properties.distance,
        decay: properties.decay,
        ...shadowProps(properties),

    };

    const spotLightRef = useRef<SpotLight>(null!);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(spotLightRef, properties.shadowMapSize);

    const showHelper = editMode && isSelected;
    const showShadowHelper = showHelper && Boolean(properties.castShadow);
    return (
        <>
            <spotLight
                ref={spotLightRef}
                position={[0, 0, 0]}
                {...lightProps}
                target={target}
            >
                {showHelper && <Helper type={SpotLightHelper} />}
                {resolvedMap ? <AssetBoundary subscribeToRetry={store.subscribe}>
                    <SpotLightMap path={resolvedMap} />
                </AssetBoundary> : null}
                {editMode ? (
                    <EditorLightGizmo
                        color={properties.color}
                        selected={isSelected}
                        targetOffset={properties.targetOffset}
                    />
                ) : null}
                {showHelper && (
                    <>
                        <mesh position={properties.targetOffset} userData={{ editorHelper: true }}>
                            <sphereGeometry args={[0.15, 8, 6]} />
                            <meshBasicMaterial
                                color={properties.color}
                                wireframe
                                opacity={0.5}
                                transparent
                            />
                        </mesh>
                    </>
                )}

                {children}
            </spotLight>

            {showShadowHelper && <ShadowCameraHelper light={spotLightRef} />}
            <primitive object={target} position={properties.targetOffset} />
        </>
    );
}

const SpotLightComponent: Component<SpotLightProperties> = {
    name: 'SpotLight',
    dependencies: p => p.map ? [{ kind: 'texture', path: p.map }] : [],
    renderWhenDisabled: true,
    description: "Emit a cone of light from this node toward targetOffset. Position with Transform; angle controls cone width and penumbra softens its edge.",
    category: 'lighting',
    View: SpotLightView,
    properties: {
        ...localLightProperties,
        angle: { description: "Cone half-angle in radians, from 0 to PI/2.", default: spotLightDefaults.angle, min: 0, max: Math.PI / 2, step: 0.05 },
        penumbra: { description: "Soft edge fraction: 0 is sharp, 1 softens the whole cone.", default: spotLightDefaults.penumbra, min: 0, max: 1, step: 0.05 },
        targetOffset: { description: "Aim point relative to this node, in local scene units; the node transform also rotates this offset.", type: 'vector3', default: spotLightDefaults.targetOffset },
        map: { type: 'string', default: spotLightDefaults.map },
    },
};

export default SpotLightComponent;
