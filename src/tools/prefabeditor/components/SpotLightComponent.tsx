import { Component } from "./ComponentRegistry";
import { useRef, useEffect } from "react";

function SpotLightComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const props = {
        color: component.properties.color ?? '#ffffff',
        intensity: component.properties.intensity ?? 1.0,
        angle: component.properties.angle ?? Math.PI / 6,
        penumbra: component.properties.penumbra ?? 0.5,
        distance: component.properties.distance ?? 100,
        castShadow: component.properties.castShadow ?? true
    };

    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Color</label>
            <div style={{ display: 'flex', gap: 2 }}>
                <input
                    type="color"
                    style={{ height: 20, width: 20, backgroundColor: 'transparent', border: 'none', cursor: 'pointer' }}
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, 'color': e.target.value })}
                />
                <input
                    type="text"
                    style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                    value={props.color}
                    onChange={e => onUpdate({ ...component.properties, 'color': e.target.value })}
                />
            </div>
        </div>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Intensity</label>
            <input
                type="number"
                step="0.1"
                style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                value={props.intensity}
                onChange={e => onUpdate({ ...component.properties, 'intensity': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Angle</label>
            <input
                type="number"
                step="0.1"
                min="0"
                max={Math.PI}
                style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                value={props.angle}
                onChange={e => onUpdate({ ...component.properties, 'angle': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Penumbra</label>
            <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                value={props.penumbra}
                onChange={e => onUpdate({ ...component.properties, 'penumbra': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Distance</label>
            <input
                type="number"
                step="1"
                min="0"
                style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                value={props.distance}
                onChange={e => onUpdate({ ...component.properties, 'distance': parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Cast Shadow</label>
            <input
                type="checkbox"
                style={{ height: 16, width: 16, backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', cursor: 'pointer' }}
                checked={props.castShadow}
                onChange={e => onUpdate({ ...component.properties, 'castShadow': e.target.checked })}
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
