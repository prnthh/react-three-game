import { RigidBody } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { Component } from "./ComponentRegistry";

const selectClass = "w-full bg-black/40 border border-cyan-500/30 px-1 py-0.5 text-[10px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400/50";
const labelClass = "block text-[9px] text-cyan-400/60 uppercase tracking-wider mb-0.5";

function PhysicsComponentEditor({ component, onUpdate }: { component: { properties: { type?: 'dynamic' | 'fixed'; collider?: string;[k: string]: any } }; onUpdate: (props: Partial<Record<string, any>>) => void }) {
    const { type = 'dynamic', collider = 'hull' } = component.properties;
    return (
        <div>
            <label className={labelClass}>Type</label>
            <select className={selectClass} value={type} onChange={e => onUpdate({ type: e.target.value })}>
                <option value="dynamic">Dynamic</option>
                <option value="fixed">Fixed</option>
            </select>

            <label className={`${labelClass} mt-2`}>Collider</label>
            <select className={selectClass} value={collider} onChange={e => onUpdate({ collider: e.target.value })}>
                <option value="hull">Hull (convex)</option>
                <option value="trimesh">Trimesh (exact)</option>
                <option value="cuboid">Cuboid (box)</option>
                <option value="ball">Ball (sphere)</option>
            </select>
        </div>
    );
}

interface PhysicsViewProps {
    properties: { type?: 'dynamic' | 'fixed'; collider?: string };
    editMode?: boolean;
    children?: ReactNode;
}

function PhysicsComponentView({ properties, editMode, children }: PhysicsViewProps) {
    if (editMode) return <>{children}</>;

    const colliders = properties.collider || (properties.type === 'fixed' ? 'trimesh' : 'hull');

    // Remount RigidBody when collider/type changes to avoid Rapier hook dependency warnings
    const rbKey = `${properties.type || 'dynamic'}_${colliders}`;

    return (
        <RigidBody key={rbKey} type={properties.type} colliders={colliders as any}>
            {children}
        </RigidBody>
    );
}

const PhysicsComponent: Component = {
    name: 'Physics',
    Editor: PhysicsComponentEditor,
    View: PhysicsComponentView,
    defaultProperties: { type: 'dynamic', collider: 'hull' }
};

export default PhysicsComponent;