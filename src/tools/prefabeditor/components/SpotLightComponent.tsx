import { Component } from "./ComponentRegistry";
import { useRef, useEffect, useMemo, useState } from "react";
import { BooleanField, ColorField, FieldGroup, Label, NumberField } from "./Input";
import { SpotLight, SpotLightHelper } from "three";
import { LoadedTextures } from "../../dragdrop";
import { useFrame } from "@react-three/fiber";
import { TexturePicker } from "../../assetviewer/page";

const spotLightDefaults = {
    color: '#ffffff',
    intensity: 200,
    angle: 0.5,
    penumbra: 0.5,
    distance: 100,
    castShadow: true,
};

function SpotLightComponentEditor({ component, onUpdate, basePath = "" }: { component: any; onUpdate: (newComp: any) => void; basePath?: string }) {
    const values = { ...spotLightDefaults, ...component.properties };

    return (
        <FieldGroup>
            <ColorField name="color" label="Color" values={values} onChange={onUpdate} />
            <NumberField name="intensity" label="Intensity" values={values} onChange={onUpdate} min={0} step={1} fallback={200} />
            <NumberField name="angle" label="Angle" values={values} onChange={onUpdate} min={0} max={Math.PI} step={0.05} fallback={0.5} />
            <NumberField name="penumbra" label="Penumbra" values={values} onChange={onUpdate} min={0} max={1} step={0.05} fallback={0.5} />
            <NumberField name="distance" label="Distance" values={values} onChange={onUpdate} min={0} step={1} fallback={100} />
            <BooleanField name="castShadow" label="Cast Shadow" values={values} onChange={onUpdate} fallback={true} />
            <div>
                <Label>Texture Map</Label>
                <TexturePicker
                    value={values.map}
                    onChange={(map) => onUpdate({ map })}
                    basePath={basePath}
                />
            </div>
        </FieldGroup>
    );
}

function SpotLightView({ properties, children, editMode, isSelected, loadedTextures }: { properties: any; children?: React.ReactNode; editMode?: boolean; isSelected?: boolean; loadedTextures?: LoadedTextures }) {
    const merged = { ...spotLightDefaults, ...properties };
    const color = merged.color;
    const intensity = merged.intensity;
    const angle = merged.angle;
    const penumbra = merged.penumbra;
    const distance = merged.distance;
    const castShadow = merged.castShadow;
    const textureMap = merged.map && loadedTextures ? loadedTextures[merged.map] : undefined;

    const spotLightRef = useRef<SpotLight>(null);
    const targetRef = useRef<any>(null);
    const [spotLight, setSpotLight] = useState<SpotLight | null>(null);
    const spotLightHelper = useMemo(
        () => spotLight ? new SpotLightHelper(spotLight, color) : null,
        [spotLight, color]
    );

    useEffect(() => {
        return () => {
            spotLightHelper?.dispose();
        };
    }, [spotLightHelper]);

    useEffect(() => {
        if (spotLightRef.current && targetRef.current) {
            spotLightRef.current.target = targetRef.current;
            setSpotLight(spotLightRef.current);
        }
    }, []);

    useFrame(() => {
        if (spotLightHelper && editMode && isSelected) {
            spotLightHelper.update();
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
                map={textureMap}
                castShadow={castShadow}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-bias={-0.0001}
                shadow-normalBias={0.02}
            />
            {editMode && isSelected && spotLightHelper && (
                <primitive object={spotLightHelper} />
            )}
            <object3D ref={targetRef} position={[0, -5, 0]} />
            {editMode && (
                <>
                    <mesh>
                        <sphereGeometry args={[0.2, 8, 6]} />
                        <meshBasicMaterial color={color} wireframe />
                    </mesh>
                    <mesh position={[0, -5, 0]}>
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
    defaultProperties: spotLightDefaults,
    getAssetRefs: (properties) => {
        if (properties.map) return [{ type: 'texture', path: properties.map }];
        return [];
    },
};

export default SpotLightComponent;
