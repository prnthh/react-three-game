import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";
import { Input, Label } from "./Input";

function SpotLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const props = {
        color: component.properties.color ?? '#ffffff',
        intensity: component.properties.intensity ?? 1.0,
        angle: component.properties.angle ?? Math.PI / 6,
        penumbra: component.properties.penumbra ?? 0.5,
        distance: component.properties.distance ?? 100,
        castShadow: component.properties.castShadow ?? true
    };

    const textInputStyle = {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
    };

    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
            <Label>Color</Label>
            <div style={{ display: 'flex', gap: 2 }}>
                <input
                    type="color"
                    style={{ height: 20, width: 20, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, color: e.target.value })}
                />
                <input
                    type="text"
                    style={textInputStyle}
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, color: e.target.value })}
                />
            </div>
        </div>
        <div>
            <Label>Intensity</Label>
            <Input step="0.1" value={props.intensity} onChange={value => onUpdate({ ...component.properties, intensity: value })} />
        </div>
        <div>
            <Label>Angle</Label>
            <Input step="0.1" min={0} max={Math.PI} value={props.angle} onChange={value => onUpdate({ ...component.properties, angle: value })} />
        </div>
        <div>
            <Label>Penumbra</Label>
            <Input step="0.1" min={0} max={1} value={props.penumbra} onChange={value => onUpdate({ ...component.properties, penumbra: value })} />
        </div>
        <div>
            <Label>Distance</Label>
            <Input step="1" min={0} value={props.distance} onChange={value => onUpdate({ ...component.properties, distance: value })} />
        </div>
        <div>
            <Label>Cast Shadow</Label>
            <input
                type="checkbox"
                style={{ height: 16, width: 16, backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', cursor: 'pointer' }}
                checked={props.castShadow}
                onChange={e => onUpdate({ ...component.properties, castShadow: e.target.checked })}
            />
        </div>
    </div>;
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
