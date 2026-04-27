import { assetRef, assetRefs } from "./ComponentRegistry";
import type { Component, ComponentViewProps } from "./ComponentRegistry";
import { useHelper } from "@react-three/drei";
import { useRef } from "react";
import { BooleanField, ColorField, Label, NumberField, Vector3Input } from "./Input";
import { SpotLightHelper } from "three";
import type { Object3D } from "three";
import type { SpotLight } from "three";
import { useAssetRuntime, useNode } from "../assetRuntime";
import { TexturePicker } from "../../assetviewer/page";
import { LightSection, ShadowBiasField, mergeWithDefaults } from "./lightUtils";
import type { ComponentData } from "../types";

const spotLightDefaults = {
    color: '#ffffff',
    intensity: 1,
    angle: Math.PI / 3,
    penumbra: 0,
    distance: 0,
    decay: 2,
    castShadow: false,
    shadowMapSize: 512,
    shadowBias: 0,
    shadowNormalBias: 0,
    shadowAutoUpdate: true,
    shadowCameraNear: 0.5,
    shadowCameraFar: 500,
    targetOffset: [0, -5, 0] as [number, number, number],
    map: undefined as string | undefined,
};

type SpotLightProperties = typeof spotLightDefaults & Record<string, unknown>;

function SpotLightComponentEditor({ component, onUpdate, basePath = "" }: { component: ComponentData; onUpdate: (newComp: Record<string, unknown>) => void; basePath?: string }) {
    const values = mergeWithDefaults(spotLightDefaults, component.properties) as SpotLightProperties;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={onUpdate} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={onUpdate} min={0} step={0.1} fallback={1} />
                <NumberField name="angle" label="Angle" values={values} onChange={onUpdate} min={0} max={Math.PI / 2} step={0.05} fallback={Math.PI / 3} />
                <NumberField name="penumbra" label="Penumbra" values={values} onChange={onUpdate} min={0} max={1} step={0.05} fallback={0} />
                <NumberField name="distance" label="Distance" values={values} onChange={onUpdate} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={onUpdate} min={0} step={0.1} fallback={2} />
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => onUpdate({ targetOffset })}
                    snap={0.5}
                />
                <div>
                    <Label>Texture Map</Label>
                    <TexturePicker
                        value={values.map}
                        onChange={(map) => onUpdate({ map })}
                        basePath={basePath}
                    />
                </div>
            </LightSection>
            <LightSection title="Shadow">
                <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={onUpdate} fallback={false} />
                {values.castShadow ? (
                    <>
                        <BooleanField name="shadowAutoUpdate" label="Auto Update" values={values} onChange={onUpdate} fallback={true} />
                        <NumberField name="shadowMapSize" label="Map Size" values={values} onChange={onUpdate} min={128} step={128} fallback={512} />
                        <ShadowBiasField name="shadowBias" label="Bias" values={values} onChange={onUpdate} fallback={0} />
                        <ShadowBiasField name="shadowNormalBias" label="Normal Bias" values={values} onChange={onUpdate} fallback={0} />
                        <NumberField name="shadowCameraNear" label="Near" values={values} onChange={onUpdate} min={0.001} step={0.1} fallback={0.5} />
                        <NumberField name="shadowCameraFar" label="Far" values={values} onChange={onUpdate} min={0.1} step={1} fallback={500} />
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}

function SpotLightView({ properties, children }: ComponentViewProps) {
    const { getTexture } = useAssetRuntime();
    const { editMode, isSelected } = useNode();

    const merged = mergeWithDefaults(spotLightDefaults, properties) as SpotLightProperties;

    const textureMap = merged.map
        ? getTexture(merged.map) ?? undefined
        : undefined;

    const lightProps = {
        color: merged.color,
        intensity: merged.intensity,
        angle: merged.angle,
        penumbra: merged.penumbra,
        distance: merged.distance,
        decay: merged.decay,
        castShadow: merged.castShadow,
        map: textureMap,

        // mapped props
        "shadow-mapSize-width": merged.shadowMapSize,
        "shadow-mapSize-height": merged.shadowMapSize,
        "shadow-bias": merged.shadowBias,
        "shadow-normalBias": merged.shadowNormalBias,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
    };

    const spotLightRef = useRef<SpotLight>(null);
    const targetRef = useRef<Object3D | null>(null);

    const showHelper = editMode && isSelected;
    const helperTarget = showHelper && spotLightRef.current ? { current: spotLightRef.current } : null;
    useHelper(helperTarget, SpotLightHelper);

    return (
        <group>
            <spotLight
                ref={spotLightRef}
                {...lightProps}
                target={targetRef.current ?? undefined}
            >
                {showHelper && (
                    <>
                        <mesh>
                            <sphereGeometry args={[0.2, 8, 6]} />
                            <meshBasicMaterial color={merged.color} wireframe />
                        </mesh>

                        <mesh position={merged.targetOffset}>
                            <sphereGeometry args={[0.15, 8, 6]} />
                            <meshBasicMaterial
                                color={merged.color}
                                wireframe
                                opacity={0.5}
                                transparent
                            />
                        </mesh>
                    </>
                )}

                {children}
            </spotLight>

            <object3D
                ref={targetRef}
                position={merged.targetOffset}
            />
        </group>
    );
}

const SpotLightComponent: Component = {
    name: 'SpotLight',
    Editor: SpotLightComponentEditor,
    View: SpotLightView,
    defaultProperties: {},
    getAssetRefs: (properties) => assetRefs(assetRef('texture', properties.map)),
};

export default SpotLightComponent;
