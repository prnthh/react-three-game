import { Component } from "react-three-game";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group } from "three";

function RotatorComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const props = {
        speed: component.properties.speed ?? 1.0,
        axis: component.properties.axis ?? 'y'
    };

    return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Rotation Speed</label>
            <input
                type="number"
                step="0.1"
                style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                value={props.speed}
                onChange={e => onUpdate({ ...component.properties, speed: parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label style={{ display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Rotation Axis</label>
            <select
                style={{ width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' }}
                value={props.axis}
                onChange={e => onUpdate({ ...component.properties, axis: e.target.value })}
            >
                <option value="x">X</option>
                <option value="y">Y</option>
                <option value="z">Z</option>
            </select>
        </div>
    </div>;
}

// The view component for Rotator
function RotatorView({ properties, children }: { properties: any; children?: React.ReactNode }) {
    const groupRef = useRef<Group>(null);
    const speed = properties.speed ?? 1.0;
    const axis = properties.axis ?? 'y';

    useFrame((state, delta) => {
        if (groupRef.current) {
            if (axis === 'x') {
                groupRef.current.rotation.x += delta * speed;
            } else if (axis === 'y') {
                groupRef.current.rotation.y += delta * speed;
            } else if (axis === 'z') {
                groupRef.current.rotation.z += delta * speed;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {children}
        </group>
    );
}

const RotatorComponent: Component = {
    name: 'Rotator',
    Editor: RotatorComponentEditor,
    View: RotatorView,
    defaultProperties: {
        speed: 1.0,
        axis: 'y'
    }
};

export default RotatorComponent;
