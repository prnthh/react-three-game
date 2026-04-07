import { RigidBody, RapierRigidBody, useRapier } from "@react-three/rapier";
import type { RigidBodyOptions, CollisionPayload, IntersectionEnterPayload, IntersectionExitPayload } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { useRef, useEffect, useCallback } from 'react';
import { Component } from "./ComponentRegistry";
import { BooleanField, FieldGroup, NumberField, SelectField, Vector3Field } from "./Input";
import { ComponentData } from "../types";
import { gameEvents, getEntityIdFromRigidBody } from "../GameEvents";
import { colors } from "../styles";

export type PhysicsProps = RigidBodyOptions & {
    activeCollisionTypes?: 'all' | undefined;
    linearVelocity?: [number, number, number];
    angularVelocity?: [number, number, number];
};

const enabledAxesFallback: [boolean, boolean, boolean] = [true, true, true];

function LockedAxisField({
    label,
    values,
    onChange,
}: {
    label: string;
    values: Record<string, any>;
    onChange: (newComp: any) => void;
}) {
    const enabledTranslations = Array.isArray(values.enabledTranslations)
        ? values.enabledTranslations as [boolean, boolean, boolean]
        : enabledAxesFallback;

    const axisLabels = ['X', 'Y', 'Z'] as const;

    const toggleAxisLock = (index: number) => {
        const nextEnabledTranslations = [...enabledTranslations] as [boolean, boolean, boolean];
        nextEnabledTranslations[index] = !nextEnabledTranslations[index];
        onChange({ enabledTranslations: nextEnabledTranslations });
    };

    return (
        <div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
            }}>
                <span style={{
                    display: 'block',
                    fontSize: '10px',
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    fontWeight: 500,
                }}>
                    {label}
                </span>
                <span style={{
                    fontSize: '10px',
                    color: colors.textDim,
                }}>
                    Active means locked
                </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
                {axisLabels.map((axisLabel, index) => {
                    const isLocked = !enabledTranslations[index];

                    return (
                        <button
                            key={axisLabel}
                            type="button"
                            onClick={() => toggleAxisLock(index)}
                            style={{
                                flex: 1,
                                backgroundColor: isLocked ? colors.dangerBg : colors.bgInput,
                                border: `1px solid ${isLocked ? colors.dangerBorder : colors.border}`,
                                borderRadius: 3,
                                padding: '6px 8px',
                                color: isLocked ? colors.danger : colors.textMuted,
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                            }}
                        >
                            {axisLabel}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

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
            <Vector3Field name="linearVelocity" label="Linear Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <Vector3Field name="angularVelocity" label="Angular Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <LockedAxisField label="Lock Movement" values={component.properties} onChange={onUpdate} />
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
    const {
        type,
        colliders,
        sensor,
        activeCollisionTypes,
        linearVelocity = [0, 0, 0],
        angularVelocity = [0, 0, 0],
        enabledTranslations = enabledAxesFallback,
        ...otherProps
    } = properties;
    const colliderType = colliders || (type === 'fixed' ? 'trimesh' : 'hull');
    const rigidBodyRef = useRef<RapierRigidBody>(null);
    const linearVelocityKey = linearVelocity.join(',');
    const angularVelocityKey = angularVelocity.join(',');
    const rbKey = editMode
        ? `${type || 'dynamic'}_${colliderType}_${position?.join(',')}_${rotation?.join(',')}`
        : `${type || 'dynamic'}_${colliderType}`;

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

    // Seed authored velocities when the body instance changes or the authored values change.
    useEffect(() => {
        if (!rigidBodyRef.current) return;

        rigidBodyRef.current.setLinvel({
            x: linearVelocity[0],
            y: linearVelocity[1],
            z: linearVelocity[2],
        }, true);
    }, [rbKey, linearVelocityKey]);

    useEffect(() => {
        if (!rigidBodyRef.current) return;

        rigidBodyRef.current.setAngvel({
            x: angularVelocity[0],
            y: angularVelocity[1],
            z: angularVelocity[2],
        }, true);
    }, [rbKey, angularVelocityKey]);

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
            enabledTranslations={enabledTranslations}
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
    defaultProperties: {
        type: 'dynamic',
        colliders: 'hull',
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        enabledTranslations: [true, true, true],
    }
};

export default PhysicsComponent;
