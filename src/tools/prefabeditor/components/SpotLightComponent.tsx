import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";
import { BooleanField, ColorField, FieldGroup, NumberField } from "./Input";
import { useHelper } from "@react-three/drei";
import { SpotLightHelper } from "three";

function SpotLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldGroup>
            <ColorField name="color" label="Color" values={component.properties} onChange={onUpdate} />
            <NumberField name="intensity" label="Intensity" values={component.properties} onChange={onUpdate} min={0} step={0.1} fallback={1} />
            <NumberField name="angle" label="Angle" values={component.properties} onChange={onUpdate} min={0} max={Math.PI} step={0.05} fallback={Math.PI / 6} />
            <NumberField name="penumbra" label="Penumbra" values={component.properties} onChange={onUpdate} min={0} max={1} step={0.05} fallback={0.5} />
            <NumberField name="distance" label="Distance" values={component.properties} onChange={onUpdate} min={0} step={1} fallback={100} />
            <BooleanField name="castShadow" label="Cast Shadow" values={component.properties} onChange={onUpdate} fallback={true} />
        </FieldGroup>
    );
}

function SpotLightView({ properties, editMode, isSelected }: { properties: any; editMode?: boolean; isSelected?: boolean }) {
    const color = properties.color ?? '#ffffff';
    const intensity = properties.intensity ?? 1.0;
    const angle = properties.angle ?? Math.PI / 6;
    const penumbra = properties.penumbra ?? 0.5;
    const distance = properties.distance ?? 100;
    const castShadow = properties.castShadow ?? true;

    const spotLightRef = useRef<any>(null);
    const targetRef = useRef<any>(null);

    useHelper(editMode && isSelected ? spotLightRef : null, SpotLightHelper, color);

    useEffect(() => {
        if (spotLightRef.current && targetRef.current) {
            spotLightRef.current.target = targetRef.current;
        }
    }, []);

    return (
        <>
            <spotLight
                ref={spotLightRef}
                color={color}
                intensity={intensity}
                angle={angle}
                penumbra={penumbra}
                distance={distance}
                castShadow={castShadow}
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-bias={-0.0001}
                shadow-normalBias={0.02}
            />
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
        </>
    );
}

const SpotLightComponent: Component = {
    name: 'SpotLight',
    Editor: SpotLightComponentEditor,
    View: SpotLightView,
    defaultProperties: {}
};

export default SpotLightComponent;
