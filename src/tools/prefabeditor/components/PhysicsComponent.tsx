import { RigidBody, RapierRigidBody } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Component } from "./ComponentRegistry";
import { Label } from "./Input";
import { Quaternion, Euler } from 'three';

export interface PhysicsProps {
    type: "fixed" | "dynamic";
    collider?: string;
    mass?: number;
    restitution?: number;
    friction?: number;
}

function PhysicsComponentEditor({ component, onUpdate }: { component: { properties: { type?: 'dynamic' | 'fixed'; collider?: string;[k: string]: any } }; onUpdate: (props: Partial<Record<string, any>>) => void }) {
    const { type = 'dynamic', collider = 'hull' } = component.properties;

    const selectStyle = {
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        border: '1px solid rgba(34, 211, 238, 0.3)',
        padding: '2px 4px',
        fontSize: '10px',
        color: 'rgba(165, 243, 252, 1)',
        fontFamily: 'monospace',
        outline: 'none',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
                <Label>Type</Label>
                <select style={selectStyle} value={type} onChange={e => onUpdate({ type: e.target.value })}>
                    <option value="dynamic">Dynamic</option>
                    <option value="fixed">Fixed</option>
                </select>
            </div>

            <div>
                <Label>Collider</Label>
                <select style={selectStyle} value={collider} onChange={e => onUpdate({ collider: e.target.value })}>
                    <option value="hull">Hull (convex)</option>
                    <option value="trimesh">Trimesh (exact)</option>
                    <option value="cuboid">Cuboid (box)</option>
                    <option value="ball">Ball (sphere)</option>
                </select>
            </div>
        </div>
    );
}

interface PhysicsViewProps {
    properties: { type?: 'dynamic' | 'fixed'; collider?: string };
    editMode?: boolean;
    children?: ReactNode;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
}

function PhysicsComponentView({ properties, children, position, rotation, scale, editMode }: PhysicsViewProps) {
    const colliders = properties.collider || (properties.type === 'fixed' ? 'trimesh' : 'hull');

    // In edit mode, include position/rotation in key to force remount when transform changes
    // This ensures the RigidBody debug visualization updates even when physics is paused
    const rbKey = editMode
        ? `${properties.type || 'dynamic'}_${colliders}_${position?.join(',')}_${rotation?.join(',')}`
        : `${properties.type || 'dynamic'}_${colliders}`;

    return (
        <RigidBody
            key={rbKey}
            type={properties.type}
            colliders={colliders as any}
            position={position}
            rotation={rotation}
            scale={scale}
        >
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