import { Component } from "./ComponentRegistry";
import { useHelper } from "@react-three/drei";
import { useRef, useEffect } from "react";
import { BooleanField, ColorField, Label, NumberField, Vector3Input } from "./Input";
import { Object3D, SpotLight, SpotLightHelper } from "three";
import { useAssetRuntime, useNode } from "../assetRuntime";
import { useFrame } from "@react-three/fiber";
import { TexturePicker } from "../../assetviewer/page";
import { LightSection, ShadowBiasField, mergeWithDefaults } from "./lightUtils";

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

function SpotLightComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const values = mergeWithDefaults(spotLightDefaults, component.properties);

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

function SpotLightView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const { getTexture } = useAssetRuntime();
    const { editMode, isSelected } = useNode();
    const merged = mergeWithDefaults(spotLightDefaults, properties);
    const color = merged.color;
    const intensity = merged.intensity;
    const angle = merged.angle;
    const penumbra = merged.penumbra;
    const distance = merged.distance;
    const decay = merged.decay;
    const castShadow = merged.castShadow;
    const shadowMapSize = merged.shadowMapSize;
    const shadowBias = merged.shadowBias;
    const shadowNormalBias = merged.shadowNormalBias;
    const shadowAutoUpdate = merged.shadowAutoUpdate;
    const shadowCameraNear = merged.shadowCameraNear;
    const shadowCameraFar = merged.shadowCameraFar;
    const targetOffset = merged.targetOffset;
    const textureMap = merged.map ? getTexture(merged.map) ?? undefined : undefined;
    const spotLightRef = useRef<SpotLight>(null);
    const targetRef = useRef<any>(null);
    useHelper(
        editMode && isSelected ? spotLightRef as React.RefObject<Object3D> : null,
        SpotLightHelper,
        color
    );

    useEffect(() => {
        if (spotLightRef.current && targetRef.current) {
            spotLightRef.current.target = targetRef.current;
        }
    }, [castShadow]);

    useEffect(() => {
        const shadow = spotLightRef.current?.shadow;
        if (!shadow) return;

        shadow.needsUpdate = true;
        shadow.camera.updateProjectionMatrix();
    }, [castShadow, shadowMapSize, shadowBias, shadowNormalBias, shadowAutoUpdate, shadowCameraNear, shadowCameraFar]);

    useFrame(() => {
        if (spotLightRef.current?.target) {
            spotLightRef.current.target.updateMatrixWorld();
        }
    });

    return (
        <>
            <spotLight
                ref={spotLightRef}
                color={color}
                intensity={intensity}
                angle={angle}
                penumbra={penumbra}
                distance={distance}
                decay={decay}
                map={textureMap}
                castShadow={castShadow}
                shadow-mapSize-width={shadowMapSize}
                shadow-mapSize-height={shadowMapSize}
                shadow-bias={shadowBias}
                shadow-normalBias={shadowNormalBias}
                shadow-autoUpdate={shadowAutoUpdate}
                shadow-camera-near={shadowCameraNear}
                shadow-camera-far={shadowCameraFar}
            />
            <object3D ref={targetRef} position={targetOffset as [number, number, number]} />
            {editMode && isSelected && (
                <>
                    <mesh>
                        <sphereGeometry args={[0.2, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe />
                    </mesh>
                    <mesh position={targetOffset as [number, number, number]}>
                        <sphereGeometry args={[0.15, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe opacity={0.5} transparent />
                    </mesh>
                </>
            )}
            {children}
        </>
    );
}

const SpotLightComponent: Component = {
    name: 'SpotLight',
    Editor: SpotLightComponentEditor,
    View: SpotLightView,
    defaultProperties: {},
    getAssetRefs: (properties) => {
        if (properties.map) return [{ type: 'texture', path: properties.map }];
        return [];
    },
};

export default SpotLightComponent;
