import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Children, Fragment, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import {
    FieldRenderer,
    gameEvents,
    soundManager,
    useNode,
    useNodeObject,
    useScene,
    type Component,
    type ComponentViewProps,
    type FieldDefinition,
    type GameObject,
    type NodeInteractionHandlers,
} from "react-three-game/editor";
import { Quaternion, Vector3, type Material, type Mesh, type Object3D } from "three";
import { withBasePath } from "../../basePath";

type IndustrialMachineGunProperties = {
    barrelId?: string;
    fireRate?: number;
    projectileSpeed?: number;
    projectileRadius?: number;
    projectileLifetime?: number;
    muzzleOffset?: number;
    muzzleFlashId?: string;
    spread?: number;
    shotEventName?: string;
    triggerEventName?: string;
    projectileCountEventName?: string;
    aimYawRange?: number;
    aimPitchRange?: number;
    aimSmoothing?: number;
    recoilKick?: number;
    recoilReturn?: number;
    fireSound?: string;
    fireVolume?: number;
};

type LiveProjectile = {
    id: string;
    age: number;
    lifetime: number;
};

const fireDirection = new Vector3();
const firePosition = new Vector3();
const fireQuaternion = new Quaternion();
const fireRight = new Vector3();
const fireUp = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
const LOCAL_RIGHT = new Vector3(1, 0, 0);
const aimYawQuaternion = new Quaternion();
const aimPitchQuaternion = new Quaternion();
const aimComposedQuaternion = new Quaternion();
const DEFAULT_SHOT_EVENT = "machinegun:shot";
const DEFAULT_TRIGGER_EVENT = "machinegun:trigger";
const DEFAULT_PROJECTILE_COUNT_EVENT = "machinegun:projectiles";
const DEFAULT_FIRE_RATE = 12;
const DEFAULT_PROJECTILE_SPEED = 82;
const DEFAULT_PROJECTILE_RADIUS = 0.11;
const DEFAULT_PROJECTILE_LIFETIME = 1.3;
const DEFAULT_MUZZLE_OFFSET = 1.95;
const DEFAULT_SPREAD = 0.018;
const DEFAULT_YAW_RANGE = 0.7;
const DEFAULT_PITCH_RANGE = 0.38;
const DEFAULT_AIM_SMOOTHING = 9;
const DEFAULT_RECOIL_KICK = 0.045;
const DEFAULT_RECOIL_RETURN = 11;
const DEFAULT_FIRE_VOLUME = 0.18;

function setMuzzleFlashObject(object: Object3D | null, intensity: number) {
    if (!object) return;

    const visible = intensity > 0.01;
    object.visible = visible;
    object.scale.setScalar(0.5 + intensity * 1.35);

    object.traverse((child) => {
        child.visible = visible;
        const material = (child as Mesh).material as Material | Material[] | undefined;
        const materials = Array.isArray(material) ? material : material ? [material] : [];

        materials.forEach((entry) => {
            entry.transparent = true;
            entry.opacity = Math.min(0.95, intensity * 0.86);
            entry.depthWrite = false;
            entry.needsUpdate = true;
        });
    });
}

const machineGunFields: FieldDefinition[] = [
    { name: "barrelId", type: "node", label: "Barrel" },
    { name: "fireRate", type: "number", label: "Fire Rate", min: 1, step: 1 },
    { name: "projectileSpeed", type: "number", label: "Projectile Speed", min: 1, step: 1 },
    { name: "projectileRadius", type: "number", label: "Projectile Radius", min: 0.02, step: 0.01 },
    { name: "projectileLifetime", type: "number", label: "Projectile Lifetime", min: 0.2, step: 0.1 },
    { name: "muzzleOffset", type: "number", label: "Muzzle Offset", step: 0.1 },
    { name: "muzzleFlashId", type: "node", label: "Muzzle Flash" },
    { name: "spread", type: "number", label: "Spread", min: 0, step: 0.001 },
    { name: "shotEventName", type: "string", label: "Shot Event" },
    { name: "triggerEventName", type: "string", label: "Trigger Event" },
    { name: "projectileCountEventName", type: "string", label: "Projectile Count Event" },
    { name: "aimYawRange", type: "number", label: "Aim Yaw Range", min: 0, step: 0.01 },
    { name: "aimPitchRange", type: "number", label: "Aim Pitch Range", min: 0, step: 0.01 },
    { name: "aimSmoothing", type: "number", label: "Aim Smoothing", min: 1, step: 0.5 },
    { name: "recoilKick", type: "number", label: "Recoil Kick", min: 0, step: 0.01 },
    { name: "recoilReturn", type: "number", label: "Recoil Return", min: 0.1, step: 0.1 },
    { name: "fireSound", type: "string", label: "Fire Sound" },
    { name: "fireVolume", type: "number", label: "Fire Volume", min: 0, max: 1, step: 0.05 },
];

function IndustrialMachineGunEditor({
    component,
    onUpdate,
}: {
    component: { properties: IndustrialMachineGunProperties };
    onUpdate: (next: Partial<IndustrialMachineGunProperties>) => void;
}) {
    return <FieldRenderer fields={machineGunFields} values={component.properties} onChange={onUpdate} />;
}

function createProjectileNode(
    spawnPosition: Vector3,
    launchVelocity: Vector3,
    radius: number,
): GameObject {
    return {
        id: crypto.randomUUID(),
        name: "machinegun-round",
        components: {
            transform: {
                type: "Transform",
                properties: {
                    position: [spawnPosition.x, spawnPosition.y, spawnPosition.z],
                },
            },
            geometry: {
                type: "Geometry",
                properties: {
                    geometryType: "sphere",
                    args: [radius, 12, 8],
                    castShadow: false,
                    receiveShadow: false,
                },
            },
            material: {
                type: "Material",
                properties: {
                    materialType: "basic",
                    color: "#fff7ad",
                    toneMapped: false,
                },
            },
            crashcatPhysics: {
                type: "CrashcatPhysics",
                properties: {
                    type: "dynamic",
                    colliders: "ball",
                    restitution: 0.78,
                    friction: 0.04,
                    linearVelocity: [launchVelocity.x, launchVelocity.y, launchVelocity.z],
                },
            },
        },
    };
}

function readBarrelPose(scene: ReturnType<typeof useScene>, barrelId: string, muzzleOffset: number, spread: number) {
    const barrelObject = scene.getObject(barrelId);
    if (!barrelObject) return null;

    barrelObject.updateWorldMatrix(true, false);
    barrelObject.getWorldPosition(firePosition);
    barrelObject.getWorldQuaternion(fireQuaternion);

    fireDirection.set(0, -1, 0).applyQuaternion(fireQuaternion).normalize();
    fireRight.set(1, 0, 0).applyQuaternion(fireQuaternion).normalize();
    fireUp.set(0, 0, 1).applyQuaternion(fireQuaternion).normalize();

    if (spread > 0) {
        fireDirection
            .addScaledVector(fireRight, (Math.random() - 0.5) * spread)
            .addScaledVector(fireUp, (Math.random() - 0.5) * spread)
            .normalize();
    }

    const spawnPosition = firePosition.clone().addScaledVector(fireDirection, muzzleOffset);

    return {
        spawnPosition,
        direction: fireDirection.clone(),
    };
}

function getPointerCaptureTarget(event: ThreeEvent<PointerEvent>) {
    return event.target as EventTarget & {
        setPointerCapture?: (pointerId: number) => void;
        releasePointerCapture?: (pointerId: number) => void;
    };
}

function emitProjectileCount(properties: IndustrialMachineGunProperties, nodeId: string, activeProjectileCount: number) {
    const eventName = properties.projectileCountEventName?.trim() || DEFAULT_PROJECTILE_COUNT_EVENT;
    gameEvents.emit(eventName, {
        sourceEntityId: nodeId,
        sourceNodeId: nodeId,
        activeProjectileCount,
    });
}

function attachPointerHandlersToPrimaryChild(
    children: ReactNode,
    pointerHandlers: NodeInteractionHandlers | undefined,
): ReactNode {
    if (!pointerHandlers) return children;

    let attached = false;
    const attach = (node: ReactNode): ReactNode => Children.map(node, child => {
        if (!isValidElement(child)) return child;

        if (child.type === Fragment) {
            const fragment = child as ReactElement<{ children?: ReactNode }>;
            return cloneElement(fragment, undefined, attach(fragment.props.children));
        }

        if (attached) return child;
        attached = true;

        return cloneElement(child as ReactElement<NodeInteractionHandlers>, pointerHandlers);
    });

    return attach(children);
}

function IndustrialMachineGunView({
    properties,
    children,
    nodeInteractionHandlers,
}: ComponentViewProps<IndustrialMachineGunProperties>) {
    const scene = useScene();
    const { editMode, nodeId } = useNode();
    const objectRef = useNodeObject();
    const [isFiring, setIsFiring] = useState(false);
    const firingRef = useRef(false);
    const shotAccumulatorRef = useRef(0);
    const liveProjectilesRef = useRef<LiveProjectile[]>([]);
    const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
    const flashPulseRef = useRef(0);
    const flashHeatRef = useRef(0);
    const baseRotationRef = useRef<{ x: number; y: number; z: number } | null>(null);
    const baseQuaternionRef = useRef<Quaternion | null>(null);
    const recoilRef = useRef(0);
    const aimTargetRef = useRef({ yaw: 0, pitch: 0 });
    const aimCurrentRef = useRef({ yaw: 0, pitch: 0 });

    const setAimTarget = useCallback((yaw: number, pitch: number, active: boolean) => {
        const maxYaw = properties.aimYawRange ?? DEFAULT_YAW_RANGE;
        const maxPitch = properties.aimPitchRange ?? DEFAULT_PITCH_RANGE;
        aimTargetRef.current = active
            ? {
                yaw: Math.max(-maxYaw, Math.min(maxYaw, yaw)),
                pitch: Math.max(-maxPitch, Math.min(maxPitch, pitch)),
            }
            : { yaw: 0, pitch: 0 };
    }, [properties.aimPitchRange, properties.aimYawRange]);

    useEffect(() => {
        return () => {
            const object = objectRef.current;
            const baseRotation = baseRotationRef.current;
            const baseQuaternion = baseQuaternionRef.current;
            if (!object || !baseRotation || !baseQuaternion) return;
            object.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z);
            object.quaternion.copy(baseQuaternion);
        };
    }, [objectRef]);

    const stopFiring = useCallback(() => {
        if (!firingRef.current) return;

        firingRef.current = false;
        pointerOriginRef.current = null;
        setIsFiring(false);
        const eventName = properties.triggerEventName?.trim() || DEFAULT_TRIGGER_EVENT;
        const barrelId = properties.barrelId?.trim() || nodeId;
        gameEvents.emit(eventName, {
            sourceEntityId: nodeId,
            sourceNodeId: nodeId,
            barrelId,
            active: false,
        });
        setAimTarget(0, 0, false);
    }, [nodeId, properties.barrelId, properties.triggerEventName, setAimTarget]);

    const startFiring = useCallback((origin?: { x: number; y: number }) => {
        if (editMode || firingRef.current) return;

        pointerOriginRef.current = origin ?? null;
        firingRef.current = true;
        shotAccumulatorRef.current = 1 / Math.max(1, properties.fireRate ?? DEFAULT_FIRE_RATE);
        setIsFiring(true);
        const eventName = properties.triggerEventName?.trim() || DEFAULT_TRIGGER_EVENT;
        const barrelId = properties.barrelId?.trim() || nodeId;
        gameEvents.emit(eventName, {
            sourceEntityId: nodeId,
            sourceNodeId: nodeId,
            barrelId,
            active: true,
        });
        setAimTarget(0, 0, true);
    }, [editMode, nodeId, properties.barrelId, properties.fireRate, properties.triggerEventName, setAimTarget]);

    const updateAimFromPointer = useCallback((event: ThreeEvent<PointerEvent>) => {
        if (!firingRef.current) return;

        const origin = pointerOriginRef.current;
        if (!origin) return;

        const viewportWidth = Math.max(window.innerWidth, 1);
        const viewportHeight = Math.max(window.innerHeight, 1);
        const deltaX = event.nativeEvent.clientX - origin.x;
        const deltaY = event.nativeEvent.clientY - origin.y;
        const yaw = -(deltaX / viewportWidth) * 5.4 * (properties.aimYawRange ?? DEFAULT_YAW_RANGE);
        const pitch = (-deltaY / viewportHeight) * 4.8 * (properties.aimPitchRange ?? DEFAULT_PITCH_RANGE);

        setAimTarget(yaw, pitch, true);
    }, [properties.aimPitchRange, properties.aimYawRange, setAimTarget]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code !== "Space" || event.repeat) return;
            event.preventDefault();
            startFiring();
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            event.preventDefault();
            stopFiring();
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            stopFiring();
        };
    }, [startFiring, stopFiring]);

    const fireOneShot = useCallback(() => {
        const barrelId = properties.barrelId?.trim() || nodeId;
        const projectileSpeed = properties.projectileSpeed ?? DEFAULT_PROJECTILE_SPEED;
        const projectileRadius = properties.projectileRadius ?? DEFAULT_PROJECTILE_RADIUS;
        const projectileLifetime = properties.projectileLifetime ?? DEFAULT_PROJECTILE_LIFETIME;
        const pose = readBarrelPose(scene, barrelId, properties.muzzleOffset ?? DEFAULT_MUZZLE_OFFSET, properties.spread ?? DEFAULT_SPREAD);
        if (!pose) return;

        const launchVelocity = pose.direction.clone().multiplyScalar(projectileSpeed);
        const spawnStart = performance.now();
        const projectile = scene.add(createProjectileNode(pose.spawnPosition, launchVelocity, projectileRadius));
        const spawnMs = performance.now() - spawnStart;
        liveProjectilesRef.current.push({
            id: projectile.id,
            age: 0,
            lifetime: projectileLifetime,
        });

        const shotEventName = properties.shotEventName?.trim() || DEFAULT_SHOT_EVENT;
        gameEvents.emit(shotEventName, {
            sourceEntityId: nodeId,
            sourceNodeId: nodeId,
            barrelId,
            projectileId: projectile.id,
            spawnMs,
            activeProjectileCount: liveProjectilesRef.current.length,
            spawnPosition: [pose.spawnPosition.x, pose.spawnPosition.y, pose.spawnPosition.z] as [number, number, number],
            direction: [pose.direction.x, pose.direction.y, pose.direction.z] as [number, number, number],
        });
        emitProjectileCount(properties, nodeId, liveProjectilesRef.current.length);

        flashPulseRef.current = 1;
        recoilRef.current = Math.min(recoilRef.current + (properties.recoilKick ?? DEFAULT_RECOIL_KICK), 0.22);

        const fireSound = properties.fireSound?.trim();
        if (fireSound) {
            void soundManager.play(withBasePath(fireSound), {
                volume: properties.fireVolume ?? DEFAULT_FIRE_VOLUME,
                pitch: 1.35 + Math.random() * 0.18,
            });
        }
    }, [
        nodeId,
        properties.barrelId,
        properties.fireSound,
        properties.fireVolume,
        properties.muzzleOffset,
        properties.projectileLifetime,
        properties.projectileRadius,
        properties.projectileSpeed,
        properties.projectileCountEventName,
        properties.recoilKick,
        properties.shotEventName,
        properties.spread,
        scene,
    ]);

    useFrame((_, delta) => {
        const object = objectRef.current;
        if (object && !editMode) {
            if (!baseRotationRef.current) {
                baseRotationRef.current = {
                    x: object.rotation.x,
                    y: object.rotation.y,
                    z: object.rotation.z,
                };
                baseQuaternionRef.current = object.quaternion.clone();
            }

            const baseQuaternion = baseQuaternionRef.current;
            if (baseQuaternion) {
                const aimBlend = 1 - Math.exp(-(properties.aimSmoothing ?? DEFAULT_AIM_SMOOTHING) * delta);
                const aimCurrent = aimCurrentRef.current;
                const aimTarget = aimTargetRef.current;
                aimCurrent.yaw += (aimTarget.yaw - aimCurrent.yaw) * aimBlend;
                aimCurrent.pitch += (aimTarget.pitch - aimCurrent.pitch) * aimBlend;
                recoilRef.current = Math.max(0, recoilRef.current - (properties.recoilReturn ?? DEFAULT_RECOIL_RETURN) * delta);

                aimYawQuaternion.setFromAxisAngle(WORLD_UP, aimCurrent.yaw);
                aimPitchQuaternion.setFromAxisAngle(LOCAL_RIGHT, aimCurrent.pitch + recoilRef.current);
                aimComposedQuaternion.copy(aimYawQuaternion).multiply(baseQuaternion).multiply(aimPitchQuaternion);
                object.quaternion.copy(aimComposedQuaternion);
            }
        }

        const muzzleFlashId = properties.muzzleFlashId?.trim();
        const muzzleFlashObject = muzzleFlashId ? scene.getObject(muzzleFlashId) : null;

        if (editMode) {
            flashPulseRef.current = 0;
            flashHeatRef.current = 0;
            setMuzzleFlashObject(muzzleFlashObject, 0);
        } else {
            const heatTarget = firingRef.current ? 0.22 : 0;
            const heatBlend = 1 - Math.exp(-8 * delta);
            flashHeatRef.current += (heatTarget - flashHeatRef.current) * heatBlend;
            flashPulseRef.current = Math.max(0, flashPulseRef.current - 12 * delta);
            setMuzzleFlashObject(muzzleFlashObject, Math.max(flashPulseRef.current, flashHeatRef.current));
        }

        const liveProjectiles = liveProjectilesRef.current;
        let removedProjectiles = false;
        for (let index = liveProjectiles.length - 1; index >= 0; index -= 1) {
            const projectile = liveProjectiles[index];
            projectile.age += delta;
            if (projectile.age < projectile.lifetime) continue;

            scene.remove(projectile.id);
            liveProjectiles.splice(index, 1);
            removedProjectiles = true;
        }

        if (removedProjectiles) {
            emitProjectileCount(properties, nodeId, liveProjectiles.length);
        }

        if (!firingRef.current || editMode) return;

        const secondsPerShot = 1 / Math.max(1, properties.fireRate ?? DEFAULT_FIRE_RATE);
        shotAccumulatorRef.current += delta;

        if (shotAccumulatorRef.current >= secondsPerShot) {
            shotAccumulatorRef.current -= secondsPerShot;
            fireOneShot();
        }
    });

    const pointerHandlers = editMode ? nodeInteractionHandlers : nodeInteractionHandlers ? {
        ...nodeInteractionHandlers,
        onPointerDown: (event: ThreeEvent<PointerEvent>) => {
            nodeInteractionHandlers?.onPointerDown?.(event);
            event.stopPropagation();
            getPointerCaptureTarget(event).setPointerCapture?.(event.pointerId);
            startFiring({
                x: event.nativeEvent.clientX,
                y: event.nativeEvent.clientY,
            });
        },
        onPointerMove: (event: ThreeEvent<PointerEvent>) => {
            nodeInteractionHandlers?.onPointerMove?.(event);
            event.stopPropagation();
            updateAimFromPointer(event);
        },
        onPointerUp: (event: ThreeEvent<PointerEvent>) => {
            nodeInteractionHandlers?.onPointerUp?.(event);
            event.stopPropagation();
            getPointerCaptureTarget(event).releasePointerCapture?.(event.pointerId);
            stopFiring();
        },
        onPointerCancel: (event: ThreeEvent<PointerEvent>) => {
            nodeInteractionHandlers?.onPointerCancel?.(event);
            event.stopPropagation();
            stopFiring();
        },
        onLostPointerCapture: (event: ThreeEvent<PointerEvent>) => {
            nodeInteractionHandlers?.onLostPointerCapture?.(event);
            event.stopPropagation();
            stopFiring();
        },
    } : undefined;
    const interactiveChildren = attachPointerHandlersToPrimaryChild(children, pointerHandlers);

    return (
        <group
            userData={{ machineGunActive: isFiring }}
        >
            {interactiveChildren}
        </group>
    );
}

const IndustrialMachineGunComponent: Component = {
    name: "IndustrialMachineGun",
    Editor: IndustrialMachineGunEditor,
    View: IndustrialMachineGunView,
    defaultProperties: {
        barrelId: "",
        fireRate: DEFAULT_FIRE_RATE,
        projectileSpeed: DEFAULT_PROJECTILE_SPEED,
        projectileRadius: DEFAULT_PROJECTILE_RADIUS,
        projectileLifetime: DEFAULT_PROJECTILE_LIFETIME,
        muzzleOffset: DEFAULT_MUZZLE_OFFSET,
        muzzleFlashId: "",
        spread: DEFAULT_SPREAD,
        shotEventName: DEFAULT_SHOT_EVENT,
        triggerEventName: DEFAULT_TRIGGER_EVENT,
        projectileCountEventName: DEFAULT_PROJECTILE_COUNT_EVENT,
        aimYawRange: DEFAULT_YAW_RANGE,
        aimPitchRange: DEFAULT_PITCH_RANGE,
        aimSmoothing: DEFAULT_AIM_SMOOTHING,
        recoilKick: DEFAULT_RECOIL_KICK,
        recoilReturn: DEFAULT_RECOIL_RETURN,
        fireSound: "/sound/explode.mp3",
        fireVolume: DEFAULT_FIRE_VOLUME,
    },
};

export default IndustrialMachineGunComponent;
