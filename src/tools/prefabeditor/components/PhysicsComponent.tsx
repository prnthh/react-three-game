import { RigidBody } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { Component } from "./ComponentRegistry";

const selectClass = { width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(34, 211, 238, 0.3)', padding: '2px 4px', fontSize: '10px', color: 'rgba(165, 243, 252, 1)', fontFamily: 'monospace', outline: 'none' };
const labelClass = { display: 'block', fontSize: '9px', color: 'rgba(34, 211, 238, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 };

function PhysicsComponentEditor({ component, onUpdate }: { component: { properties: { type?: 'dynamic' | 'fixed'; collider?: string;[k: string]: any } }; onUpdate: (props: Partial<Record<string, any>>) => void }) {
    const { type = 'dynamic', collider = 'hull' } = component.properties;
    return (
        <div>
            <label style={labelClass}>Type</label>
            <select style={selectClass as any} value={type} onChange={e => onUpdate({ type: e.target.value })}>
                <option value="dynamic">Dynamic</option>
                <option value="fixed">Fixed</option>
            </select>

            <label style={{ ...labelClass, marginTop: 8 }}>Collider</label>
            <select style={selectClass as any} value={collider} onChange={e => onUpdate({ collider: e.target.value })}>
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