import { RigidBody, RapierRigidBody, useRapier } from "@react-three/rapier";
import type { RigidBodyOptions, CollisionPayload, IntersectionEnterPayload, IntersectionExitPayload } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { useRef, useEffect, useCallback } from 'react';
import { Component } from "./ComponentRegistry";
import { BooleanField, FieldGroup, NumberField, SelectField } from "./Input";
import { ComponentData } from "../types";
import { gameEvents, getEntityIdFromRigidBody } from "../GameEvents";

export type PhysicsProps = RigidBodyOptions & {
    activeCollisionTypes?: 'all' | undefined;
};

function PhysicsComponentEditor({ component, onUpdate }: { component: ComponentData; onUpdate: (newComp: any) => void }) {
    return (
        <FieldGroup>
            <SelectField
                name="type"
                label="Type"
                values={component.properties}
                onChange={onUpdate}
                options={[
                    { value: 'dynamic', label: 'Dynamic' },
                    { value: 'fixed', label: 'Fixed' },
                    { value: 'kinematicPosition', label: 'Kinematic Position' },
                    { value: 'kinematicVelocity', label: 'Kinematic Velocity' },
                ]}
            />
            <SelectField
                name="colliders"
                label="Collider"
                values={component.properties}
                onChange={onUpdate}
                options={[
                    { value: 'hull', label: 'Hull (convex)' },
                    { value: 'trimesh', label: 'Trimesh (exact)' },
                    { value: 'cuboid', label: 'Cuboid (box)' },
                    { value: 'ball', label: 'Ball (sphere)' },
                ]}
            />
            <NumberField name="mass" label="Mass" values={component.properties} onChange={onUpdate} fallback={1} step={0.1} min={0} />
            <NumberField name="restitution" label="Restitution (Bounciness)" values={component.properties} onChange={onUpdate} fallback={0} min={0} max={1} step={0.1} />
            <NumberField name="friction" label="Friction" values={component.properties} onChange={onUpdate} fallback={0.5} min={0} step={0.1} />
            <NumberField name="linearDamping" label="Linear Damping" values={component.properties} onChange={onUpdate} fallback={0} min={0} step={0.1} />
            <NumberField name="angularDamping" label="Angular Damping" values={component.properties} onChange={onUpdate} fallback={0} min={0} step={0.1} />
            <NumberField name="gravityScale" label="Gravity Scale" values={component.properties} onChange={onUpdate} fallback={1} step={0.1} />
            <BooleanField name="sensor" label="Sensor (Trigger Only)" values={component.properties} onChange={onUpdate} fallback={false} />
            <SelectField
                name="activeCollisionTypes"
                label="Collision Detection"
                values={component.properties}
                onChange={onUpdate}
                options={[
                    { value: '', label: 'Default (Dynamic only)' },
                    { value: 'all', label: 'All (includes kinematic & fixed)' },
                ]}
            />
        </FieldGroup>
    );
}

interface PhysicsViewProps {
    properties: PhysicsProps;
    editMode?: boolean;
    children?: ReactNode;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    nodeId?: string;
    registerRigidBodyRef?: (id: string, rb: RapierRigidBody | null) => void;
}

function PhysicsComponentView({ properties, children, position, rotation, scale, editMode, nodeId, registerRigidBodyRef }: PhysicsViewProps) {
    const { type, colliders, sensor, activeCollisionTypes, ...otherProps } = properties;
    const colliderType = colliders || (type === 'fixed' ? 'trimesh' : 'hull');
    const rigidBodyRef = useRef<RapierRigidBody>(null);

    // Try to get rapier context - will be null if not inside <Physics>
    let rapier: any = null;
    try {
        const rapierContext = useRapier();
        rapier = rapierContext.rapier;
    } catch (e) {
        // Not inside Physics context - that's ok, just won't have rapier features
    }

    // Register RigidBody ref when it's available
    useEffect(() => {
        if (nodeId && registerRigidBodyRef && rigidBodyRef.current) {
            registerRigidBodyRef(nodeId, rigidBodyRef.current);
        }
        return () => {
            if (nodeId && registerRigidBodyRef) {
                registerRigidBodyRef(nodeId, null);
            }
        };
    }, [nodeId, registerRigidBodyRef]);

    // Configure active collision types for kinematic/sensor bodies
    useEffect(() => {
        if (activeCollisionTypes === 'all' && rigidBodyRef.current && rapier) {
            const rb = rigidBodyRef.current;
            // Apply to all colliders on this rigid body
            for (let i = 0; i < rb.numColliders(); i++) {
                const collider = rb.collider(i);
                collider.setActiveCollisionTypes(
                    rapier.ActiveCollisionTypes.DEFAULT |
                    rapier.ActiveCollisionTypes.KINEMATIC_FIXED |
                    rapier.ActiveCollisionTypes.KINEMATIC_KINEMATIC
                );
            }
        }
    }, [activeCollisionTypes, rapier, type, colliders]);

    // Event handlers for physics interactions
    const handleIntersectionEnter = useCallback((payload: IntersectionEnterPayload) => {
        if (!nodeId) return;
        gameEvents.emit('sensor:enter', {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [nodeId]);

    const handleIntersectionExit = useCallback((payload: IntersectionExitPayload) => {
        if (!nodeId) return;
        gameEvents.emit('sensor:exit', {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [nodeId]);

    const handleCollisionEnter = useCallback((payload: CollisionPayload) => {
        if (!nodeId) return;
        gameEvents.emit('collision:enter', {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [nodeId]);

    const handleCollisionExit = useCallback((payload: CollisionPayload) => {
        if (!nodeId) return;
        gameEvents.emit('collision:exit', {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [nodeId]);

    // In edit mode, include position/rotation in key to force remount when transform changes
    // This ensures the RigidBody debug visualization updates even when physics is paused
    const rbKey = editMode
        ? `${type || 'dynamic'}_${colliderType}_${position?.join(',')}_${rotation?.join(',')}`
        : `${type || 'dynamic'}_${colliderType}`;

    return (
        <RigidBody
            key={rbKey}
            ref={rigidBodyRef}
            type={type}
            colliders={colliderType as any}
            position={position}
            rotation={rotation}
            scale={scale}
            sensor={sensor}
            userData={{ entityId: nodeId }}
            onIntersectionEnter={handleIntersectionEnter}
            onIntersectionExit={handleIntersectionExit}
            onCollisionEnter={handleCollisionEnter}
            onCollisionExit={handleCollisionExit}
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
