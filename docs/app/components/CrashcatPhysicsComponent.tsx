"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
    BooleanField,
    FieldRenderer,
    StringField,
    Vector3Field,
    useAssetRuntime,
    useNode,
    usePrefabStoreApi,
    useScene,
    PrefabEditorMode,
    type Component,
    type ComponentViewProps,
    type FieldDefinition,
} from "react-three-game";
import {
    box,
    capsule,
    convexHull,
    MotionQuality,
    MotionType,
    rigidBody,
    sphere,
    triangleMesh,
    type RigidBody,
    type World,
} from "crashcat";
import { Matrix4, Quaternion, Vector3 } from "three";
import type { Object3D } from "three";
import { useCrashcat, type CrashcatApi } from "../components/CrashcatRuntime";

const MAX_PHYSICS_DELTA = 1 / 30;

type CrashcatPhysicsProperties = {
    type?: "fixed" | "dynamic" | "kinematicPosition" | "kinematicVelocity";
    colliders?: "cuboid" | "ball" | "capsule" | "hull" | "trimesh";
    sensor?: boolean;
    friction?: number;
    restitution?: number;
    capsuleRadius?: number;
    capsuleHalfHeight?: number;
    linearVelocity?: [number, number, number];
    angularVelocity?: [number, number, number];
    collisionEnterEventName?: string;
    collisionExitEventName?: string;
    sensorEnterEventName?: string;
    sensorExitEventName?: string;
};

const crashcatPhysicsFields: FieldDefinition[] = [
    {
        name: "type",
        type: "select",
        label: "Motion Type",
        options: [
            { value: "fixed", label: "Fixed" },
            { value: "dynamic", label: "Dynamic" },
            { value: "kinematicPosition", label: "Kinematic Position" },
            { value: "kinematicVelocity", label: "Kinematic Velocity" },
        ],
    },
    {
        name: "colliders",
        type: "select",
        label: "Collider",
        options: [
            { value: "cuboid", label: "Cuboid" },
            { value: "ball", label: "Ball" },
            { value: "capsule", label: "Capsule" },
            { value: "hull", label: "Hull" },
            { value: "trimesh", label: "Tri Mesh" },
        ],
    },
    { name: "friction", type: "number", label: "Friction", step: 0.05 },
    { name: "restitution", type: "number", label: "Restitution", step: 0.05 },
    { name: "capsuleRadius", type: "number", label: "Capsule Radius", step: 0.05 },
    { name: "capsuleHalfHeight", type: "number", label: "Capsule Half Height", step: 0.05 },
];

type CrashcatPhysicsEditorProps = {
    component: { properties: CrashcatPhysicsProperties };
    onUpdate: (values: CrashcatPhysicsProperties) => void;
};

function CrashcatPhysicsEditor({ component, onUpdate }: CrashcatPhysicsEditorProps) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FieldRenderer fields={crashcatPhysicsFields} values={component.properties} onChange={onUpdate} />
            <BooleanField name="sensor" label="Sensor" values={component.properties} onChange={onUpdate} fallback={false} />
            <Vector3Field name="linearVelocity" label="Linear Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <Vector3Field name="angularVelocity" label="Angular Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <StringField name="collisionEnterEventName" label="Collision Enter" values={component.properties} onChange={onUpdate} fallback="" />
            <StringField name="collisionExitEventName" label="Collision Exit" values={component.properties} onChange={onUpdate} fallback="" />
            <StringField name="sensorEnterEventName" label="Sensor Enter" values={component.properties} onChange={onUpdate} fallback="" />
            <StringField name="sensorExitEventName" label="Sensor Exit" values={component.properties} onChange={onUpdate} fallback="" />
        </div>
    );
}

const inverseWorldMatrix = new Matrix4();
const childToLocalMatrix = new Matrix4();
const scratchVertex = new Vector3();
const scratchScale = new Vector3();
const scratchPosition = new Vector3();
const scratchBoundsSize = new Vector3();
const worldQuaternion = new Quaternion();
const parentWorldQuaternion = new Quaternion();
const localQuaternion = new Quaternion();

type GeometryData = { positions: number[]; indices: number[] };

function collectGeometryData(object: Object3D): GeometryData | null {
    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    inverseWorldMatrix.copy(object.matrixWorld).invert();

    object.traverse((child) => {
        const geometry = (child as Object3D & {
            geometry?: {
                attributes?: { position?: { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number } };
                index?: { count: number; getX: (i: number) => number } | null;
            };
        }).geometry;
        const positionAttribute = geometry?.attributes?.position;
        if (!positionAttribute) return;

        childToLocalMatrix.multiplyMatrices(inverseWorldMatrix, child.matrixWorld);

        for (let i = 0; i < positionAttribute.count; i += 1) {
            scratchVertex
                .set(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i))
                .applyMatrix4(childToLocalMatrix);
            positions.push(scratchVertex.x, scratchVertex.y, scratchVertex.z);
        }

        if (geometry.index) {
            for (let i = 0; i < geometry.index.count; i += 1) {
                indices.push(vertexOffset + geometry.index.getX(i));
            }
        } else {
            for (let i = 0; i < positionAttribute.count; i += 1) {
                indices.push(vertexOffset + i);
            }
        }

        vertexOffset += positionAttribute.count;
    });

    if (positions.length === 0 || indices.length < 3) return null;
    return { positions, indices };
}

function createShapeForObject(object: Object3D, physics: CrashcatPhysicsProperties) {
    object.updateWorldMatrix(true, true);

    if (physics.colliders === "trimesh") {
        const geometry = collectGeometryData(object);
        return geometry ? triangleMesh.create(geometry) : null;
    }

    if (physics.colliders === "hull") {
        const geometry = collectGeometryData(object);
        return geometry ? convexHull.create({ positions: geometry.positions }) : null;
    }

    if (physics.colliders === "capsule") {
        return capsule.create({
            radius: Math.max(physics.capsuleRadius ?? 0.35, 0.01),
            halfHeightOfCylinder: Math.max(physics.capsuleHalfHeight ?? 0.45, 0.01),
        });
    }

    object.getWorldScale(scratchScale);
    const geometry = collectGeometryData(object);
    if (!geometry) return null;

    if (physics.colliders === "ball") {
        let maxRadiusSq = 0;
        for (let i = 0; i < geometry.positions.length; i += 3) {
            const x = geometry.positions[i] * scratchScale.x;
            const y = geometry.positions[i + 1] * scratchScale.y;
            const z = geometry.positions[i + 2] * scratchScale.z;
            maxRadiusSq = Math.max(maxRadiusSq, x * x + y * y + z * z);
        }
        return sphere.create({ radius: Math.max(Math.sqrt(maxRadiusSq), 0.01) });
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < geometry.positions.length; i += 3) {
        const x = geometry.positions[i] * scratchScale.x;
        const y = geometry.positions[i + 1] * scratchScale.y;
        const z = geometry.positions[i + 2] * scratchScale.z;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    scratchBoundsSize.set(maxX - minX, maxY - minY, maxZ - minZ);

    return box.create({
        halfExtents: [
            Math.max(scratchBoundsSize.x * 0.5, 0.01),
            Math.max(scratchBoundsSize.y * 0.5, 0.01),
            Math.max(scratchBoundsSize.z * 0.5, 0.01),
        ],
    });
}

function toMotionType(physics: CrashcatPhysicsProperties): MotionType {
    if (physics.type === "dynamic") return MotionType.DYNAMIC;
    if (physics.type === "kinematicPosition" || physics.type === "kinematicVelocity") return MotionType.KINEMATIC;
    return MotionType.STATIC;
}

function toMotionQuality(physics: CrashcatPhysicsProperties) {
    return physics.type === "kinematicPosition" ? MotionQuality.LINEAR_CAST : undefined;
}

function setObjectWorldTransform(object: Object3D, position: [number, number, number], quaternion: [number, number, number, number]) {
    if (!object.parent) {
        object.position.set(position[0], position[1], position[2]);
        object.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
        object.updateMatrixWorld(true);
        return;
    }

    scratchPosition.set(position[0], position[1], position[2]);
    object.parent.worldToLocal(scratchPosition);
    object.position.copy(scratchPosition);
    object.parent.getWorldQuaternion(parentWorldQuaternion);
    worldQuaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
    localQuaternion.copy(parentWorldQuaternion).invert().multiply(worldQuaternion);
    object.quaternion.copy(localQuaternion);
    object.updateMatrixWorld(true);
}

function syncObjectToBody(world: World, body: RigidBody, object: Object3D, position: [number, number, number], quaternion: [number, number, number, number], delta?: number) {
    object.getWorldPosition(scratchPosition);
    object.getWorldQuaternion(worldQuaternion);
    position.splice(0, 3, scratchPosition.x, scratchPosition.y, scratchPosition.z);
    quaternion.splice(0, 4, worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w);

    if (delta === undefined) {
        rigidBody.setPosition(world, body, position, false);
        rigidBody.setQuaternion(world, body, quaternion, false);
    } else {
        rigidBody.moveKinematic(body, position, quaternion, delta);
    }
}

function bodyTransformChanged(body: RigidBody, lastPosition: [number, number, number] | null, lastQuaternion: [number, number, number, number] | null) {
    const position = body.position;
    const quaternion = body.quaternion;
    return !lastPosition
        || position[0] !== lastPosition[0]
        || position[1] !== lastPosition[1]
        || position[2] !== lastPosition[2]
        || quaternion[0] !== lastQuaternion?.[0]
        || quaternion[1] !== lastQuaternion?.[1]
        || quaternion[2] !== lastQuaternion?.[2]
        || quaternion[3] !== lastQuaternion?.[3];
}

function getRegisteredBody(api: CrashcatApi | null, nodeId: string, body: RigidBody | null) {
    return api && body && api.getBody(nodeId) === body ? body : null;
}

function CrashcatPhysicsView({ properties, children }: ComponentViewProps<CrashcatPhysicsProperties>) {
    const { nodeId, getObject } = useNode();
    const scene = useScene();
    const store = usePrefabStoreApi();
    const api: CrashcatApi | null = useCrashcat();
    const { getAssetRevision } = useAssetRuntime();
    const revision = getAssetRevision();
    const bodyRef = useRef<RigidBody | null>(null);
    const motionTypeRef = useRef(MotionType.STATIC);
    const syncPositionRef = useRef<[number, number, number]>([0, 0, 0]);
    const syncQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
    const lastPositionRef = useRef<[number, number, number] | null>(null);
    const lastQuaternionRef = useRef<[number, number, number, number] | null>(null);
    const {
        angularVelocity,
        capsuleHalfHeight,
        capsuleRadius,
        colliders,
        collisionEnterEventName,
        collisionExitEventName,
        friction,
        linearVelocity,
        restitution,
        sensor,
        sensorEnterEventName,
        sensorExitEventName,
        type,
    } = properties;
    const physics = useMemo<CrashcatPhysicsProperties>(() => ({
        angularVelocity,
        capsuleHalfHeight,
        capsuleRadius,
        colliders,
        collisionEnterEventName,
        collisionExitEventName,
        friction,
        linearVelocity,
        restitution,
        sensor,
        sensorEnterEventName,
        sensorExitEventName,
        type,
    }), [
        angularVelocity,
        capsuleHalfHeight,
        capsuleRadius,
        colliders,
        collisionEnterEventName,
        collisionExitEventName,
        friction,
        linearVelocity,
        restitution,
        sensor,
        sensorEnterEventName,
        sensorExitEventName,
        type,
    ]);

    useEffect(() => {
        // Rebuild mesh-derived colliders when referenced assets finish loading.
        void revision;
        if (!api) return;
        const object = getObject();
        if (!object) return;

        const shape = createShapeForObject(object, physics);
        if (!shape) return;

        object.updateWorldMatrix(true, true);
        object.getWorldPosition(scratchPosition);
        const wq = new Quaternion();
        object.getWorldQuaternion(wq);

        const motionType = toMotionType(physics);
        const motionQuality = toMotionQuality(physics);
        const isKinematic = motionType === MotionType.KINEMATIC;
        const isStatic = motionType === MotionType.STATIC;

        const body = rigidBody.create(api.world, {
            shape,
            motionType,
            motionQuality,
            objectLayer: isStatic ? api.staticObjectLayer : api.movingObjectLayer,
            position: [scratchPosition.x, scratchPosition.y, scratchPosition.z],
            quaternion: [wq.x, wq.y, wq.z, wq.w],
            sensor: Boolean(physics.sensor),
            collideKinematicVsNonDynamic: isKinematic,
            friction: physics.friction,
            restitution: physics.restitution,
            userData: { nodeId },
        });

        if (physics.linearVelocity) {
            rigidBody.setLinearVelocity(api.world, body, physics.linearVelocity);
        }
        if (physics.angularVelocity) {
            rigidBody.setAngularVelocity(api.world, body, physics.angularVelocity);
        }

        bodyRef.current = body;
        motionTypeRef.current = motionType;
        lastPositionRef.current = null;
        lastQuaternionRef.current = null;

        api.register(nodeId, body, {
            motionType,
            sensor: Boolean(physics.sensor),
            events: {
                collisionEnter: physics.collisionEnterEventName,
                collisionExit: physics.collisionExitEventName,
                sensorEnter: physics.sensorEnterEventName,
                sensorExit: physics.sensorExitEventName,
            },
        });

        return () => {
            bodyRef.current = null;
            api.unregister(nodeId);
        };
    }, [
        api,
        getObject,
        nodeId,
        physics,
        revision,
    ]);

    useEffect(() => {
        const syncEditBody = () => {
            const body = getRegisteredBody(api, nodeId, bodyRef.current);
            const object = getObject();
            if (!api || !body || !object || scene.mode !== PrefabEditorMode.Edit) return;
            syncObjectToBody(api.world, body, object, syncPositionRef.current, syncQuaternionRef.current);
        };

        syncEditBody();
        return store.subscribe(syncEditBody);
    }, [api, getObject, nodeId, scene.mode, store]);

    useFrame((_, delta) => {
        const body = getRegisteredBody(api, nodeId, bodyRef.current);
        const object = getObject();
        if (!api || !body || !object || scene.mode !== PrefabEditorMode.Play || motionTypeRef.current !== MotionType.KINEMATIC) return;
        syncObjectToBody(api.world, body, object, syncPositionRef.current, syncQuaternionRef.current, Math.min(delta, MAX_PHYSICS_DELTA));
    }, -2);

    useFrame(() => {
        const body = getRegisteredBody(api, nodeId, bodyRef.current);
        const object = getObject();
        if (!api || !body || !object || motionTypeRef.current !== MotionType.DYNAMIC || scene.mode !== PrefabEditorMode.Play) return;

        if (bodyTransformChanged(body, lastPositionRef.current, lastQuaternionRef.current)) {
            setObjectWorldTransform(object, body.position, body.quaternion);
            lastPositionRef.current = [body.position[0], body.position[1], body.position[2]];
            lastQuaternionRef.current = [body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]];
        }

        if (body.position[1] < -40) {
            bodyRef.current = null;
            api.unregister(nodeId);
        }
    });

    return <>{children}</>;
}

const CrashcatPhysicsComponent: Component = {
    name: "CrashcatPhysics",
    Editor: CrashcatPhysicsEditor,
    View: CrashcatPhysicsView,
    defaultProperties: {
        type: "fixed",
        colliders: "cuboid",
        sensor: false,
    },
};

export default CrashcatPhysicsComponent;
