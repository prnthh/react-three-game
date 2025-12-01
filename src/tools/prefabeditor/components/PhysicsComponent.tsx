import { Component } from "./ComponentRegistry";

function PhysicsComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <div>
        <label className="block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5">Type</label>
        <select
            className="w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50"
            value={component.properties.type}
            onChange={e => onUpdate({ type: e.target.value })}
        >
            <option value="dynamic">Dynamic</option>
            <option value="fixed">Fixed</option>
        </select>
    </div>;
}


import { RigidBody } from "@react-three/rapier";
import { Object3D } from "three";
import { useRef } from "react";

function PhysicsComponentView({ properties, children, registerRef, transform, editMode }: any) {
    if (editMode) return children;
    return (
        <RigidBody
            ref={el => registerRef && registerRef(properties.id, el as unknown as Object3D)}
            position={transform?.position}
            rotation={transform?.rotation}
            scale={transform?.scale}
            type={properties.type}
            colliders="cuboid"
        >
            {children}
        </RigidBody>
    );
}

const PhysicsComponent: Component = {
    name: 'Physics',
    Editor: PhysicsComponentEditor,
    View: PhysicsComponentView,
    defaultProperties: {
        type: 'dynamic'
    }
};

export default PhysicsComponent;