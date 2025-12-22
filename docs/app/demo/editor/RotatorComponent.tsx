import { Component } from "react-three-game";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group } from "three";

function RotatorComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    const props = {
        speed: component.properties.speed ?? 1.0,
        axis: component.properties.axis ?? 'y'
    };

    return <div className="flex flex-col gap-2">
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Rotation Speed</label>
            <input
                type="number"
                step="0.1"
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
                value={props.speed}
                onChange={e => onUpdate({ ...component.properties, speed: parseFloat(e.target.value) })}
            />
        </div>
        <div>
            <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Rotation Axis</label>
            <select
                className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
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
