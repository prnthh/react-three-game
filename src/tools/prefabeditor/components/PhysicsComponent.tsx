import { RigidBody, RapierRigidBody } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Component } from "./ComponentRegistry";
import { FieldRenderer, FieldDefinition } from "./Input";
import { Quaternion, Euler } from 'three';

export interface PhysicsProps {
    type: "fixed" | "dynamic";
    collider?: string;
    mass?: number;
    restitution?: number;
    friction?: number;
}

const physicsFields: FieldDefinition[] = [
    {
        name: 'type',
        type: 'select',
        label: 'Type',
        options: [
            { value: 'dynamic', label: 'Dynamic' },
            { value: 'fixed', label: 'Fixed' },
        ],
    },
    {
        name: 'collider',
        type: 'select',
        label: 'Collider',
        options: [
            { value: 'hull', label: 'Hull (convex)' },
            { value: 'trimesh', label: 'Trimesh (exact)' },
            { value: 'cuboid', label: 'Cuboid (box)' },
            { value: 'ball', label: 'Ball (sphere)' },
        ],
    },
];

function PhysicsComponentEditor({ component, onUpdate }: { component: { properties: { type?: 'dynamic' | 'fixed'; collider?: string;[k: string]: any } }; onUpdate: (props: Partial<Record<string, any>>) => void }) {
    return (
        <FieldRenderer
            fields={physicsFields}
            values={component.properties}
            onChange={onUpdate}
        />
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
    nonComposable: true,
    defaultProperties: { type: 'dynamic', collider: 'hull' }
};

export default PhysicsComponent;