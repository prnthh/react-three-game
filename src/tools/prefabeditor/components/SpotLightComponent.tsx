import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";
import { FieldRenderer, FieldDefinition } from "./Input";

const spotLightFields: FieldDefinition[] = [
    { name: 'color', type: 'color', label: 'Color' },
    { name: 'intensity', type: 'number', label: 'Intensity', step: 0.1, min: 0 },
    { name: 'angle', type: 'number', label: 'Angle', step: 0.1, min: 0, max: Math.PI },
    { name: 'penumbra', type: 'number', label: 'Penumbra', step: 0.1, min: 0, max: 1 },
    { name: 'distance', type: 'number', label: 'Distance', step: 1, min: 0 },
    { name: 'castShadow', type: 'boolean', label: 'Cast Shadow' },
];

function SpotLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldRenderer
            fields={spotLightFields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

function SpotLightView({ properties, editMode }: { properties: any; editMode?: boolean }) {
    const color = properties.color ?? '#ffffff';
    const intensity = properties.intensity ?? 1.0;
    const angle = properties.angle ?? Math.PI / 6;
    const penumbra = properties.penumbra ?? 0.5;
    const distance = properties.distance ?? 100;
    const castShadow = properties.castShadow ?? true;

    const spotLightRef = useRef<any>(null);
    const targetRef = useRef<any>(null);

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
