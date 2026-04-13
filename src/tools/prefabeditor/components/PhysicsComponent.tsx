import { CapsuleCollider, RigidBody, RapierRigidBody, useRapier } from "@react-three/rapier";
import type { RigidBodyOptions, CollisionPayload, IntersectionEnterPayload, IntersectionExitPayload } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { useRef, useEffect, useCallback } from 'react';
import { Component } from "./ComponentRegistry";
import { useAssetRuntime, useEntityRuntime } from "../runtimeContext";
import { BooleanField, FieldGroup, ListEditor, NumberField, SelectField, SelectInput, StringInput, Vector3Field } from "./Input";
import { ComponentData } from "../types";
import { gameEvents, getEntityIdFromRigidBody } from "../GameEvents";
import { colors } from "../styles";

type PhysicsColliderType = NonNullable<RigidBodyOptions['colliders']> | 'capsule';

export type PhysicsProps = Omit<RigidBodyOptions, 'colliders'> & {
    colliders?: PhysicsColliderType;
    activeCollisionTypes?: 'all' | undefined;
    linearVelocity?: [number, number, number];
    angularVelocity?: [number, number, number];
    capsuleRadius?: number;
    capsuleHalfHeight?: number;
    sensorEnterEventName?: string;
    sensorExitEventName?: string;
    collisionEnterEventName?: string;
    collisionExitEventName?: string;
};

export function isPhysicsProps(v: any): v is PhysicsProps {
    return v?.type === "fixed" || v?.type === "dynamic" || v?.type === "kinematicPosition" || v?.type === "kinematicVelocity";
}

const enabledAxesFallback: [boolean, boolean, boolean] = [true, true, true];
const capsuleRadiusFallback = 0.35;
const capsuleHalfHeightFallback = 0.45;

const PHYSICS_EVENT_OPTIONS = [
    {
        key: 'sensorEnterEventName',
        label: 'Sensor Enter',
        defaultName: 'sensor:enter',
        requiresSensor: true,
    },
    {
        key: 'sensorExitEventName',
        label: 'Sensor Exit',
        defaultName: 'sensor:exit',
        requiresSensor: true,
    },
    {
        key: 'collisionEnterEventName',
        label: 'Collision Enter',
        defaultName: 'collision:enter',
        requiresSensor: false,
    },
    {
        key: 'collisionExitEventName',
        label: 'Collision Exit',
        defaultName: 'collision:exit',
        requiresSensor: false,
    },
] as const;

type PhysicsEventKey = typeof PHYSICS_EVENT_OPTIONS[number]['key'];

function getPhysicsEventOption(key: PhysicsEventKey) {
    return PHYSICS_EVENT_OPTIONS.find(option => option.key === key);
}

function getConfiguredPhysicsEvents(values: Record<string, any>) {
    return PHYSICS_EVENT_OPTIONS.filter(option => typeof values[option.key] === 'string' && values[option.key].trim().length > 0);
}

function getAvailablePhysicsEvents(values: Record<string, any>, currentKey?: PhysicsEventKey) {
    const configuredKeys = new Set(getConfiguredPhysicsEvents(values).map(option => option.key));

    return PHYSICS_EVENT_OPTIONS
        .filter(option => option.key === currentKey || !configuredKeys.has(option.key))
        .map(option => ({ value: option.key, label: option.label }));
}

function PhysicsEventBindingsEditor({
    values,
    onChange,
}: {
    values: Record<string, any>;
    onChange: (newComp: any) => void;
}) {
    const configuredEvents = getConfiguredPhysicsEvents(values);
    const nextEventOptions = getAvailablePhysicsEvents(values);

    const addEvent = (eventKey: string) => {
        if (!eventKey) return;

        const option = getPhysicsEventOption(eventKey as PhysicsEventKey);
        if (!option) return;

        onChange({
            [option.key]: option.defaultName,
            ...(option.requiresSensor ? { sensor: true } : null),
        });
    };

    const updateEventKey = (currentKey: PhysicsEventKey, nextKey: string) => {
        const nextOption = getPhysicsEventOption(nextKey as PhysicsEventKey);
        if (!nextOption) return;

        onChange({
            [currentKey]: undefined,
            [nextOption.key]: values[currentKey] || nextOption.defaultName,
            ...(nextOption.requiresSensor ? { sensor: true } : null),
        });
    };

    const updateEventName = (key: PhysicsEventKey, eventName: string) => {
        onChange({ [key]: eventName });
    };

    const removeEvent = (key: PhysicsEventKey) => {
        onChange({ [key]: undefined });
    };

    return (
        <ListEditor
            label="Events"
            items={configuredEvents}
            onAdd={addEvent}
            addOptions={nextEventOptions}
            canAdd={nextEventOptions.length > 0}
            emptyMessage="No physics events configured."
            addButtonTitle="Add physics event"
            addDisabledTitle="All physics events already added"
            renderItem={(option) => (
                <div
                    key={option.key}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: 8,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 4,
                        background: colors.bgSurface,
                    }}
                >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <SelectInput
                                label="Type"
                                value={option.key}
                                onChange={(nextKey) => updateEventKey(option.key, nextKey)}
                                options={getAvailablePhysicsEvents(values, option.key)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => removeEvent(option.key)}
                            style={{
                                height: 24,
                                width: 28,
                                borderRadius: 3,
                                border: `1px solid ${colors.border}`,
                                background: colors.bgInput,
                                color: colors.text,
                                cursor: 'pointer',
                                padding: 0,
                                flexShrink: 0,
                            }}
                            title="Remove physics event"
                        >
                            ×
                        </button>
                    </div>
                    <StringInput
                        label="Event Name"
                        value={values[option.key] ?? option.defaultName}
                        onChange={(eventName) => updateEventName(option.key, eventName)}
                        placeholder={option.defaultName}
                    />
                </div>
            )}
        />
    );
}

function LockedAxisField({
    label,
    name,
    values,
    onChange,
}: {
    label: string;
    name: 'enabledTranslations' | 'enabledRotations';
    values: Record<string, any>;
    onChange: (newComp: any) => void;
}) {
    const enabledAxes = Array.isArray(values[name])
        ? values[name] as [boolean, boolean, boolean]
        : enabledAxesFallback;

    const axisLabels = ['X', 'Y', 'Z'] as const;

    const toggleAxisLock = (index: number) => {
        const nextEnabledAxes = [...enabledAxes] as [boolean, boolean, boolean];
        nextEnabledAxes[index] = !nextEnabledAxes[index];
        onChange({ [name]: nextEnabledAxes });
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
                    const isLocked = !enabledAxes[index];

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
                    { value: 'capsule', label: 'Capsule' },
                ]}
            />
            {component.properties.colliders === 'capsule' ? (
                <>
                    <NumberField name="capsuleRadius" label="Capsule Radius" values={component.properties} onChange={onUpdate} fallback={capsuleRadiusFallback} min={0.01} step={0.01} />
                    <NumberField name="capsuleHalfHeight" label="Capsule Half Height" values={component.properties} onChange={onUpdate} fallback={capsuleHalfHeightFallback} min={0.01} step={0.01} />
                </>
            ) : null}
            <NumberField name="mass" label="Mass" values={component.properties} onChange={onUpdate} fallback={1} step={0.1} min={0} />
            <NumberField name="restitution" label="Restitution (Bounciness)" values={component.properties} onChange={onUpdate} fallback={0} min={0} max={1} step={0.1} />
            <NumberField name="friction" label="Friction" values={component.properties} onChange={onUpdate} fallback={0.5} min={0} step={0.1} />
            <NumberField name="linearDamping" label="Linear Damping" values={component.properties} onChange={onUpdate} fallback={0} min={0} step={0.1} />
            <NumberField name="angularDamping" label="Angular Damping" values={component.properties} onChange={onUpdate} fallback={0} min={0} step={0.1} />
            <NumberField name="gravityScale" label="Gravity Scale" values={component.properties} onChange={onUpdate} fallback={1} step={0.1} />
            <Vector3Field name="linearVelocity" label="Linear Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <Vector3Field name="angularVelocity" label="Angular Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <LockedAxisField label="Lock Movement" name="enabledTranslations" values={component.properties} onChange={onUpdate} />
            <LockedAxisField label="Lock Rotations" name="enabledRotations" values={component.properties} onChange={onUpdate} />
            <BooleanField name="sensor" label="Sensor (Trigger Only)" values={component.properties} onChange={onUpdate} fallback={false} />
            <PhysicsEventBindingsEditor values={component.properties} onChange={onUpdate} />
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
    children?: ReactNode;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
}

function PhysicsComponentView({ properties, children, position, rotation, scale }: PhysicsViewProps) {
    const { registerRigidBodyRef } = useAssetRuntime();
    const { editMode, nodeId } = useEntityRuntime();
    const {
        type,
        colliders,
        sensor,
        activeCollisionTypes,
        linearVelocity = [0, 0, 0],
        angularVelocity = [0, 0, 0],
        capsuleRadius = capsuleRadiusFallback,
        capsuleHalfHeight = capsuleHalfHeightFallback,
        sensorEnterEventName,
        sensorExitEventName,
        collisionEnterEventName,
        collisionExitEventName,
        enabledTranslations = enabledAxesFallback,
        enabledRotations = enabledAxesFallback,
        ...otherProps
    } = properties;
    const colliderType = colliders || (type === 'fixed' ? 'trimesh' : 'hull');
    const usesManualCapsuleCollider = colliderType === 'capsule';
    const rigidBodyRef = useRef<RapierRigidBody>(null);
    const linearVelocityKey = linearVelocity.join(',');
    const angularVelocityKey = angularVelocity.join(',');
    const rbKey = editMode
        ? `${type || 'dynamic'}_${colliderType}_${capsuleRadius}_${capsuleHalfHeight}_${position?.join(',')}_${rotation?.join(',')}`
        : `${type || 'dynamic'}_${colliderType}_${capsuleRadius}_${capsuleHalfHeight}`;

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
        if (nodeId && rigidBodyRef.current) {
            registerRigidBodyRef(nodeId, rigidBodyRef.current);
        }
        return () => {
            if (nodeId) {
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
        if (!nodeId || !sensorEnterEventName) return;
        gameEvents.emit(sensorEnterEventName, {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [nodeId, sensorEnterEventName]);

    const handleIntersectionExit = useCallback((payload: IntersectionExitPayload) => {
        if (!nodeId || !sensorExitEventName) return;
        gameEvents.emit(sensorExitEventName, {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [nodeId, sensorExitEventName]);

    const handleCollisionEnter = useCallback((payload: CollisionPayload) => {
        if (!nodeId || !collisionEnterEventName) return;
        gameEvents.emit(collisionEnterEventName, {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [collisionEnterEventName, nodeId]);

    const handleCollisionExit = useCallback((payload: CollisionPayload) => {
        if (!nodeId || !collisionExitEventName) return;
        gameEvents.emit(collisionExitEventName, {
            sourceEntityId: nodeId,
            targetEntityId: getEntityIdFromRigidBody(payload.other.rigidBody),
            targetRigidBody: payload.other.rigidBody,
        });
    }, [collisionExitEventName, nodeId]);

    return (
        <RigidBody
            key={rbKey}
            ref={rigidBodyRef}
            type={type}
            colliders={usesManualCapsuleCollider ? false : colliderType as any}
            position={position}
            rotation={rotation}
            scale={scale}
            sensor={sensor}
            enabledTranslations={enabledTranslations}
            enabledRotations={enabledRotations}
            userData={{ entityId: nodeId }}
            onIntersectionEnter={handleIntersectionEnter}
            onIntersectionExit={handleIntersectionExit}
            onCollisionEnter={handleCollisionEnter}
            onCollisionExit={handleCollisionExit}
            {...otherProps}
        >
            {usesManualCapsuleCollider ? <CapsuleCollider args={[capsuleHalfHeight, capsuleRadius]} sensor={sensor} /> : null}
            {children}
        </RigidBody>
    );
}

const PhysicsComponent: Component = {
    name: 'Physics',
    Editor: PhysicsComponentEditor,
    View: PhysicsComponentView,
    defaultProperties: {
        type: 'dynamic',
        colliders: 'hull',
        capsuleRadius: capsuleRadiusFallback,
        capsuleHalfHeight: capsuleHalfHeightFallback,
        linearVelocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        enabledTranslations: [true, true, true],
        enabledRotations: [true, true, true],
    }
};

export default PhysicsComponent;
