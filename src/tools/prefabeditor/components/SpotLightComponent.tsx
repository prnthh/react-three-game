import { assetRef, assetRefs } from "./ComponentRegistry";
import type { Component, ComponentEditorProps, ComponentViewProps } from "./ComponentRegistry";
import { useHelper } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { BooleanField, ColorField, Label, NumberField, Vector3Input } from "./Input";
import { CameraHelper, Object3D, SpotLightHelper } from "three";
import type { SpotLight } from "three";
import { useTextureAsset } from "../assetRuntime";
import { useNode } from "../SceneContext";
import { usePrefab } from "../SceneContext";
import { useEditorRef } from "../EditorContext";
import { TexturePicker } from "../../assetviewer/page";
import {
    EditorLightGizmo,
    LightSection,
    MAX_SHADOW_MAP_SIZE,
    MIN_SHADOW_MAP_SIZE,
    ShadowBiasField,
    mergeWithDefaults,
    normalizeShadowMapSize,
    useShadowMapResolution,
} from "./lightUtils";
import { withBasePath } from "../runtimeUtils";

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

type SpotLightProperties = Partial<typeof spotLightDefaults>;

function SpotLightComponentEditor({ properties, update }: ComponentEditorProps<SpotLightProperties>) {
    const { basePath } = useEditorRef();
    const values = mergeWithDefaults(spotLightDefaults, properties);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <LightSection title="Light">
                <ColorField name="color" label="Color" values={values} onChange={update} />
                <NumberField name="intensity" label="Intensity" values={values} onChange={update} min={0} step={0.1} fallback={1} />
                <NumberField name="angle" label="Angle" values={values} onChange={update} min={0} max={Math.PI / 2} step={0.05} fallback={Math.PI / 3} />
                <NumberField name="penumbra" label="Penumbra" values={values} onChange={update} min={0} max={1} step={0.05} fallback={0} />
                <NumberField name="distance" label="Distance" values={values} onChange={update} min={0} step={1} fallback={0} />
                <NumberField name="decay" label="Decay" values={values} onChange={update} min={0} step={0.1} fallback={2} />
                <Vector3Input
                    label="Target Offset"
                    value={values.targetOffset}
                    onChange={targetOffset => update({ targetOffset })}
                    snap={0.5}
                />
                <div>
                    <Label>Texture Map</Label>
                    <TexturePicker
                        value={values.map}
                        onChange={(map) => update({ map })}
                        basePath={basePath}
                    />
                </div>
            </LightSection>
            <LightSection title="Shadow">
                <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={update} fallback={false} />
                {values.castShadow ? (
                    <>
                        <BooleanField name="shadowAutoUpdate" label="Auto Update" values={values} onChange={update} fallback={true} />
                        <NumberField
                            name="shadowMapSize"
                            label="Map Size"
                            values={values}
                            onChange={update}
                            min={MIN_SHADOW_MAP_SIZE}
                            max={MAX_SHADOW_MAP_SIZE}
                            step={128}
                            fallback={512}
                            commitOnBlur
                        />
                        <ShadowBiasField name="shadowBias" label="Bias" values={values} onChange={update} fallback={0} />
                        <ShadowBiasField name="shadowNormalBias" label="Normal Bias" values={values} onChange={update} fallback={0} />
                        <NumberField name="shadowCameraNear" label="Near" values={values} onChange={update} min={0.001} step={0.1} fallback={0.5} />
                        <NumberField name="shadowCameraFar" label="Far" values={values} onChange={update} min={0.1} step={1} fallback={500} />
                    </>
                ) : null}
            </LightSection>
        </div>
    );
}

function SpotLightView({ properties, children }: ComponentViewProps<SpotLightProperties>) {
    const { editMode, isSelected } = useNode();
    const { basePath } = usePrefab();

    const merged = mergeWithDefaults(spotLightDefaults, properties);
    const shadowMapSize = normalizeShadowMapSize(merged.shadowMapSize);

    const resolvedMap = merged.map ? withBasePath(basePath, merged.map) : merged.map;
    const textureMap = useTextureAsset(resolvedMap) ?? undefined;

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
        "shadow-bias": merged.shadowBias,
        "shadow-normalBias": merged.shadowNormalBias,
        "shadow-autoUpdate": merged.shadowAutoUpdate,
        "shadow-camera-near": merged.shadowCameraNear,
        "shadow-camera-far": merged.shadowCameraFar,
    };

    const spotLightRef = useRef<SpotLight>(null);
    const helperTargetRef = useRef<Object3D>(null!);
    const shadowCameraHelperRef = useRef<Object3D>(null!);
    const target = useMemo(() => new Object3D(), []);
    useShadowMapResolution(spotLightRef, shadowMapSize);

    const showHelper = editMode && isSelected;
    const showShadowHelper = showHelper && Boolean(merged.castShadow);
    const shadowCamera = spotLightRef.current?.shadow.camera ?? null;
    if (spotLightRef.current) helperTargetRef.current = spotLightRef.current;
    if (shadowCamera) shadowCameraHelperRef.current = shadowCamera;
    useHelper(showHelper && spotLightRef.current ? helperTargetRef : null, SpotLightHelper);
    useHelper(showShadowHelper && shadowCamera ? shadowCameraHelperRef : null, CameraHelper);

    return (
        <group>
            <spotLight
                ref={spotLightRef}
                {...lightProps}
                target={target}
            >
                {editMode ? (
                    <EditorLightGizmo
                        color={merged.color}
                        selected={isSelected}
                    />
                ) : null}
                {showHelper && (
                    <>
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

            <primitive object={target} position={merged.targetOffset} />
        </group>
    );
}

const SpotLightComponent: Component<SpotLightProperties> = {
    name: 'SpotLight',
    Editor: SpotLightComponentEditor,
    View: SpotLightView,
    defaultProperties: {},
    getAssetRefs: (properties) => assetRefs(assetRef('texture', properties.map)),
};

export default SpotLightComponent;
