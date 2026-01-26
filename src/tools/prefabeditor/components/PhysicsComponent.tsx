import { RigidBody, RapierRigidBody } from "@react-three/rapier";
import type { RigidBodyOptions } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { Component } from "./ComponentRegistry";
import { FieldRenderer, FieldDefinition } from "./Input";
import { ComponentData } from "../types";

export type PhysicsProps = RigidBodyOptions;

const physicsFields: FieldDefinition[] = [
    {
        name: 'type',
        type: 'select',
        label: 'Type',
        options: [
            { value: 'dynamic', label: 'Dynamic' },
            { value: 'fixed', label: 'Fixed' },
            { value: 'kinematicPosition', label: 'Kinematic Position' },
            { value: 'kinematicVelocity', label: 'Kinematic Velocity' },
        ],
    },
    {
        name: 'colliders',
        type: 'select',
        label: 'Collider',
        options: [
            { value: 'hull', label: 'Hull (convex)' },
            { value: 'trimesh', label: 'Trimesh (exact)' },
            { value: 'cuboid', label: 'Cuboid (box)' },
            { value: 'ball', label: 'Ball (sphere)' },
        ],
    },
    {
        name: 'mass',
        type: 'number',
        label: 'Mass',
    },
    {
        name: 'restitution',
        type: 'number',
        label: 'Restitution (Bounciness)',
        min: 0,
        max: 1,
        step: 0.1,
    },
    {
        name: 'friction',
        type: 'number',
        label: 'Friction',
        min: 0,
        step: 0.1,
    },
    {
        name: 'linearDamping',
        type: 'number',
        label: 'Linear Damping',
        min: 0,
        step: 0.1,
    },
    {
        name: 'angularDamping',
        type: 'number',
        label: 'Angular Damping',
        min: 0,
        step: 0.1,
    },
    {
        name: 'gravityScale',
        type: 'number',
        label: 'Gravity Scale',
        step: 0.1,
    },
];

function PhysicsComponentEditor({ component, onUpdate }: { component: ComponentData; onUpdate: (newComp: any) => void }) {
    return (
        <FieldRenderer
            fields={physicsFields}
            values={component.properties}
            onChange={(props) => onUpdate({ ...component, properties: { ...component.properties, ...props } })}
        />
    );
}

interface PhysicsViewProps {
    properties: PhysicsProps;
    editMode?: boolean;
    children?: ReactNode;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
}

function PhysicsComponentView({ properties, children, position, rotation, scale, editMode }: PhysicsViewProps) {
    const { type, colliders, ...otherProps } = properties;
    const colliderType = colliders || (type === 'fixed' ? 'trimesh' : 'hull');

    // In edit mode, include position/rotation in key to force remount when transform changes
    // This ensures the RigidBody debug visualization updates even when physics is paused
    const rbKey = editMode
        ? `${type || 'dynamic'}_${colliderType}_${position?.join(',')}_${rotation?.join(',')}`
        : `${type || 'dynamic'}_${colliderType}`;

    return (
        <RigidBody
            key={rbKey}
            type={type}
            colliders={colliderType as any}
            position={position}
            rotation={rotation}
            scale={scale}
            {...otherProps}
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
    defaultProperties: { type: 'dynamic', colliders: 'hull' }
};

export default PhysicsComponent;
