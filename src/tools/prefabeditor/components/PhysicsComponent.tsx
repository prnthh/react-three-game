import { CapsuleCollider, RigidBody, RapierRigidBody, useRapier } from "@react-three/rapier";
import type { CollisionPayload, IntersectionEnterPayload, IntersectionExitPayload, RigidBodyOptions } from "@react-three/rapier";
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Object3D } from 'three';
import { Component } from "./ComponentRegistry";
import { useAssetRuntime, useEntityRuntime } from "../assetRuntime";
import { gameEvents, getEntityIdFromRigidBody } from "../GameEvents";
import { usePrefabNode } from "../prefabStore";
import { BooleanField, FieldGroup, NumberField, SelectField, StringField, Vector3Field } from "./Input";
import { ComponentData, getNodeUserData } from "../types";
import { colors } from "../styles";

type PhysicsColliderType = NonNullable<RigidBodyOptions['colliders']> | 'capsule';

export type PhysicsProps = Omit<RigidBodyOptions, 'colliders'> & {
    colliders?: PhysicsColliderType;
    activeCollisionTypes?: 'all' | undefined;
    linearVelocity?: [number, number, number];
    angularVelocity?: [number, number, number];
    capsuleRadius?: number;
    capsuleHalfHeight?: number;
    emitSensorEnterEvent?: boolean;
    sensorEnterEventName?: string;
    emitSensorExitEvent?: boolean;
    sensorExitEventName?: string;
    emitCollisionEnterEvent?: boolean;
    collisionEnterEventName?: string;
    emitCollisionExitEvent?: boolean;
    collisionExitEventName?: string;
};

export function isPhysicsProps(v: any): v is PhysicsProps {
    return v?.type === "fixed" || v?.type === "dynamic" || v?.type === "kinematicPosition" || v?.type === "kinematicVelocity";
}

const enabledAxesFallback: [boolean, boolean, boolean] = [true, true, true];
const capsuleRadiusFallback = 0.35;
const capsuleHalfHeightFallback = 0.45;

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
            <BooleanField name="emitCollisionEnterEvent" label="Emit Collision Enter" values={component.properties} onChange={onUpdate} fallback={false} />
            {component.properties.emitCollisionEnterEvent ? (
                <StringField name="collisionEnterEventName" label="Collision Enter Event" values={component.properties} onChange={onUpdate} placeholder="target:hit" />
            ) : null}
            <BooleanField name="emitCollisionExitEvent" label="Emit Collision Exit" values={component.properties} onChange={onUpdate} fallback={false} />
            {component.properties.emitCollisionExitEvent ? (
                <StringField name="collisionExitEventName" label="Collision Exit Event" values={component.properties} onChange={onUpdate} placeholder="target:reset" />
            ) : null}
            <BooleanField name="emitSensorEnterEvent" label="Emit Sensor Enter" values={component.properties} onChange={onUpdate} fallback={false} />
            {component.properties.emitSensorEnterEvent ? (
                <StringField name="sensorEnterEventName" label="Sensor Enter Event" values={component.properties} onChange={onUpdate} placeholder="sensor:enter" />
            ) : null}
            <BooleanField name="emitSensorExitEvent" label="Emit Sensor Exit" values={component.properties} onChange={onUpdate} fallback={false} />
            {component.properties.emitSensorExitEvent ? (
                <StringField name="sensorExitEventName" label="Sensor Exit Event" values={component.properties} onChange={onUpdate} placeholder="sensor:exit" />
            ) : null}
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
    const { editMode, nodeId, getObject } = useEntityRuntime();
    const gameObject = usePrefabNode(nodeId);
    const nodeName = gameObject?.name?.trim() ?? '';
    const userData = {
        prefabNodeId: gameObject?.id ?? nodeId,
        ...(nodeName ? { prefabNodeName: nodeName } : {}),
        ...getNodeUserData(gameObject),
    };
    const {
        type,
        colliders,
        sensor,
        activeCollisionTypes,
        linearVelocity = [0, 0, 0],
        angularVelocity = [0, 0, 0],
        capsuleRadius = capsuleRadiusFallback,
        capsuleHalfHeight = capsuleHalfHeightFallback,
        emitSensorEnterEvent = false,
        sensorEnterEventName,
        emitSensorExitEvent = false,
        sensorExitEventName,
        emitCollisionEnterEvent = false,
        collisionEnterEventName,
        emitCollisionExitEvent = false,
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
    const handleRigidBodyRef = useCallback((rigidBody: RapierRigidBody | null) => {
        rigidBodyRef.current = rigidBody;

        if (!nodeId) return;

        registerRigidBodyRef(nodeId, rigidBody);
    }, [nodeId, registerRigidBodyRef]);

    // Try to get rapier context - will be null if not inside <Physics>
    let rapier: any = null;
    try {
        const rapierContext = useRapier();
        rapier = rapierContext.rapier;
    } catch (e) {
        // Not inside Physics context - that's ok, just won't have rapier features
    }

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

    const dispatchPhysicsEvent = useCallback((eventType: string | undefined, payload: CollisionPayload | IntersectionEnterPayload | IntersectionExitPayload) => {
        if (!nodeId) return;

        const trimmedEventType = eventType?.trim();
        if (!trimmedEventType) return;

        const targetEntityId = getEntityIdFromRigidBody(payload.other.rigidBody);

        gameEvents.emit(trimmedEventType, {
            sourceEntityId: nodeId,
            sourceNodeId: nodeId,
            sourceObject: getObject(),
            sourceRigidBody: rigidBodyRef.current,
            targetEntityId,
            targetNodeId: targetEntityId,
            targetObject: payload.other.rigidBodyObject ?? payload.other.colliderObject ?? null,
            targetRigidBody: payload.other.rigidBody ?? null,
            rapierEvent: payload,
        });
    }, [getObject, nodeId]);

    const handleIntersectionEnter = useCallback((payload: IntersectionEnterPayload) => {
        if (!emitSensorEnterEvent) return;
        dispatchPhysicsEvent(sensorEnterEventName, payload);
    }, [dispatchPhysicsEvent, emitSensorEnterEvent, sensorEnterEventName]);

    const handleIntersectionExit = useCallback((payload: IntersectionExitPayload) => {
        if (!emitSensorExitEvent) return;
        dispatchPhysicsEvent(sensorExitEventName, payload);
    }, [dispatchPhysicsEvent, emitSensorExitEvent, sensorExitEventName]);

    const handleCollisionEnter = useCallback((payload: CollisionPayload) => {
        if (!emitCollisionEnterEvent) return;
        dispatchPhysicsEvent(collisionEnterEventName, payload);
    }, [collisionEnterEventName, dispatchPhysicsEvent, emitCollisionEnterEvent]);

    const handleCollisionExit = useCallback((payload: CollisionPayload) => {
        if (!emitCollisionExitEvent) return;
        dispatchPhysicsEvent(collisionExitEventName, payload);
    }, [collisionExitEventName, dispatchPhysicsEvent, emitCollisionExitEvent]);

    const rigidBodyProps = {
        ref: handleRigidBodyRef,
        type,
        colliders: usesManualCapsuleCollider ? false : colliderType as any,
        position,
        rotation,
        scale,
        sensor,
        enabledTranslations,
        enabledRotations,
        name: nodeName,
        userData: { entityId: nodeId, ...userData },
        onIntersectionEnter: emitSensorEnterEvent ? handleIntersectionEnter : undefined,
        onIntersectionExit: emitSensorExitEvent ? handleIntersectionExit : undefined,
        onCollisionEnter: emitCollisionEnterEvent ? handleCollisionEnter : undefined,
        onCollisionExit: emitCollisionExitEvent ? handleCollisionExit : undefined,
        ...otherProps,
    };

    return (
        <RigidBody key={rbKey} {...rigidBodyProps}>
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
        emitSensorEnterEvent: false,
        sensorEnterEventName: '',
        emitSensorExitEvent: false,
        sensorExitEventName: '',
        emitCollisionEnterEvent: false,
        collisionEnterEventName: '',
        emitCollisionExitEvent: false,
        collisionExitEventName: '',
    }
};

export default PhysicsComponent;
