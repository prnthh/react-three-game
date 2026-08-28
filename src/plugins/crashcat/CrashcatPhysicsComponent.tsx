"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import {
    BooleanField,
    FieldRenderer,
    StringField,
    Vector3Field,
} from "../../tools/prefabeditor/components/Input";
import {
    type Component,
    type ComponentEditorProps,
    type ComponentViewProps,
} from "../../tools/prefabeditor/components/ComponentRegistry";
import { useModelAsset } from "../../tools/prefabeditor/assetRuntime";
import { PrefabEditorMode, useNode, usePrefab, useScene } from "../../tools/prefabeditor/SceneContext";
import { usePrefabStoreApi } from "../../tools/prefabeditor/prefabStore";
import { withBasePath } from "../../tools/prefabeditor/runtimeUtils";
import {
    box,
    capsule,
    convexHull,
    cylinder,
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
import {
    getCrashcatApi,
    observeCrashcat,
    type CrashcatApi,
    type CrashcatBodySync,
} from "./CrashcatRuntime";

const MAX_PHYSICS_DELTA = 1 / 30;

type CrashcatPhysicsProperties = {
    type?: "fixed" | "dynamic" | "kinematicPosition" | "kinematicVelocity";
    colliders?: "cuboid" | "ball" | "capsule" | "cylinder" | "hull" | "trimesh";
    sensor?: boolean;
    friction?: number;
    restitution?: number;
    capsuleRadius?: number;
    capsuleHalfHeight?: number;
    cylinderRadius?: number;
    cylinderHalfHeight?: number;
    linearVelocity?: [number, number, number];
    angularVelocity?: [number, number, number];
    collisionEnterEventName?: string;
    collisionExitEventName?: string;
    sensorEnterEventName?: string;
    sensorExitEventName?: string;
};

function CrashcatPhysicsEditor({ properties, update }: ComponentEditorProps<CrashcatPhysicsProperties>) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FieldRenderer
                fields={[
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
                            { value: "cylinder", label: "Cylinder" },
                            { value: "hull", label: "Hull" },
                            { value: "trimesh", label: "Tri Mesh" },
                        ],
                    },
                    { name: "friction", type: "number", label: "Friction", step: 0.05 },
                    { name: "restitution", type: "number", label: "Restitution", step: 0.05 },
                    { name: "capsuleRadius", type: "number", label: "Capsule Radius", step: 0.05 },
                    { name: "capsuleHalfHeight", type: "number", label: "Capsule Half Height", step: 0.05 },
                    { name: "cylinderRadius", type: "number", label: "Cylinder Radius", step: 0.05 },
                    { name: "cylinderHalfHeight", type: "number", label: "Cylinder Half Height", step: 0.05 },
                ]}
                values={properties}
                onChange={update}
            />
            <BooleanField name="sensor" label="Sensor" values={properties} onChange={update} fallback={false} />
            <Vector3Field name="linearVelocity" label="Linear Velocity" values={properties} onChange={update} fallback={[0, 0, 0]} />
            <Vector3Field name="angularVelocity" label="Angular Velocity" values={properties} onChange={update} fallback={[0, 0, 0]} />
            <StringField name="collisionEnterEventName" label="Collision Enter" values={properties} onChange={update} fallback="" />
            <StringField name="collisionExitEventName" label="Collision Exit" values={properties} onChange={update} fallback="" />
            <StringField name="sensorEnterEventName" label="Sensor Enter" values={properties} onChange={update} fallback="" />
            <StringField name="sensorExitEventName" label="Sensor Exit" values={properties} onChange={update} fallback="" />
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

// Extracted collider geometry is keyed by the sequence of geometry UUIDs in the
// object's subtree. Clones of the same model share geometry instances and have
// identical model-internal transforms, and the extraction is expressed in
// object-local space (the object's own world transform is divided out), so the
// result is identical across every instance/body of that model. Extracting once
// avoids re-walking thousands of vertices per rigid body.
const geometryDataCache = new Map<string, GeometryData>();

function collectGeometryData(object: Object3D): GeometryData | null {
    let cacheKey = "";
    object.traverse((child) => {
        const geometry = (child as Object3D & { geometry?: { uuid?: string; attributes?: { position?: unknown } } }).geometry;
        if (geometry?.attributes?.position && geometry.uuid) cacheKey += `${geometry.uuid};`;
    });
    if (cacheKey) {
        const cached = geometryDataCache.get(cacheKey);
        if (cached) return cached;
    }

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
    const result = { positions, indices };
    if (cacheKey) geometryDataCache.set(cacheKey, result);
    return result;
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

    if (physics.colliders === "cylinder") {
        return cylinder.create({
            radius: Math.max(physics.cylinderRadius ?? Math.max(scratchBoundsSize.x, scratchBoundsSize.z) * 0.5, 0.01),
            halfHeight: Math.max(physics.cylinderHalfHeight ?? scratchBoundsSize.y * 0.5, 0.01),
        });
    }

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

function createAndRegisterBody(
    api: CrashcatApi,
    nodeId: string,
    object: Object3D,
    physics: CrashcatPhysicsProperties,
    sync?: CrashcatBodySync,
) {
    const shape = createShapeForObject(object, physics);
    if (!shape) return null;

    object.getWorldPosition(scratchPosition);
    object.getWorldQuaternion(worldQuaternion);

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
        quaternion: [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w],
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

    api.register(nodeId, body, {
        motionType,
        sensor: Boolean(physics.sensor),
        events: {
            collisionEnter: physics.collisionEnterEventName,
            collisionExit: physics.collisionExitEventName,
            sensorEnter: physics.sensorEnterEventName,
            sensorExit: physics.sensorExitEventName,
        },
    }, sync);

    return body;
}

function CrashcatPhysicsView({ properties, children }: ComponentViewProps<CrashcatPhysicsProperties>) {
    const { nodeId, runtimeNodeId, getObject } = useNode();
    const scene = useScene();
    const { basePath } = usePrefab();
    const store = usePrefabStoreApi();
    const node = useStore(store, useCallback(state => state.nodesById[nodeId], [nodeId]));
    const modelPath = useMemo(() => {
        const filename = Object.values(node?.components ?? {}).find(component => component?.type === "Model")
            ?.properties?.filename as string | undefined;
        return filename ? withBasePath(basePath ?? "", filename) : null;
    }, [basePath, node]);
    const loadedModel = useModelAsset(modelPath);
    const bodyRef = useRef<RigidBody | null>(null);
    const syncPositionRef = useRef<[number, number, number]>([0, 0, 0]);
    const syncQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
    const lastPositionRef = useRef<[number, number, number] | null>(null);
    const lastQuaternionRef = useRef<[number, number, number, number] | null>(null);
    const physics = properties;

    useEffect(() => {
        // Rebuild mesh-derived colliders when this node's referenced model finishes loading.
        void loadedModel;
        let registeredApi: CrashcatApi | null = null;
        const stopObserving = observeCrashcat(api => {
            if (!api) {
                registeredApi = null;
                bodyRef.current = null;
                return;
            }

            registeredApi?.unregister(runtimeNodeId);
            registeredApi = api;
            bodyRef.current = null;

            const object = getObject();
            if (!object) return;

            const motionType = toMotionType(physics);
            const sync: CrashcatBodySync = {};

            if (motionType === MotionType.KINEMATIC) {
                sync.beforeStep = (body, delta) => {
                    const currentObject = getObject();
                    if (!currentObject) return;
                    syncObjectToBody(api.world, body, currentObject, syncPositionRef.current, syncQuaternionRef.current, Math.min(delta, MAX_PHYSICS_DELTA));
                };
            } else if (motionType === MotionType.DYNAMIC) {
                sync.afterStep = (body) => {
                    const currentObject = getObject();
                    if (!currentObject) return;

                    if (bodyTransformChanged(body, lastPositionRef.current, lastQuaternionRef.current)) {
                        setObjectWorldTransform(currentObject, body.position, body.quaternion);
                        lastPositionRef.current = [body.position[0], body.position[1], body.position[2]];
                        lastQuaternionRef.current = [body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]];
                    }

                    if (body.position[1] < -40) {
                        bodyRef.current = null;
                        api.unregister(runtimeNodeId);
                    }
                };
            }

            bodyRef.current = createAndRegisterBody(api, runtimeNodeId, object, physics, sync);
            lastPositionRef.current = null;
            lastQuaternionRef.current = null;
        });

        return () => {
            stopObserving();
            bodyRef.current = null;
            registeredApi?.unregister(runtimeNodeId);
        };
    }, [
        getObject,
        runtimeNodeId,
        physics,
        loadedModel,
    ]);

    useEffect(() => {
        if (scene.mode !== PrefabEditorMode.Edit) return;

        const syncEditBody = () => {
            const api = getCrashcatApi();
            const body = getRegisteredBody(api, runtimeNodeId, bodyRef.current);
            const object = getObject();
            if (!api || !body || !object) return;
            syncObjectToBody(api.world, body, object, syncPositionRef.current, syncQuaternionRef.current);
        };

        syncEditBody();
        // Transform authoring replaces this node record. Subscribe to that one
        // record so edits elsewhere in the prefab do not wake every physics body.
        return store.subscribe(
            state => state.nodesById[nodeId],
            syncEditBody,
        );
    }, [getObject, nodeId, runtimeNodeId, scene.mode, store]);

    return <>{children}</>;
}

const CrashcatPhysicsComponent: Component<CrashcatPhysicsProperties> = {
    name: "CrashcatPhysics",
    Editor: CrashcatPhysicsEditor,
    View: CrashcatPhysicsView,
    properties: {
        type: {
            type: "select",
            default: "fixed",
            options: [
                { value: "fixed", label: "Fixed" },
                { value: "dynamic", label: "Dynamic" },
                { value: "kinematicPosition", label: "Kinematic Position" },
                { value: "kinematicVelocity", label: "Kinematic Velocity" },
            ],
        },
        colliders: {
            type: "select",
            default: "cuboid",
            options: [
                { value: "cuboid", label: "Cuboid" },
                { value: "ball", label: "Ball" },
                { value: "capsule", label: "Capsule" },
                { value: "cylinder", label: "Cylinder" },
                { value: "hull", label: "Hull" },
                { value: "trimesh", label: "Tri Mesh" },
            ],
        },
        sensor: { type: "boolean", default: false },
        friction: { default: undefined },
        restitution: { default: undefined },
        capsuleRadius: { default: undefined },
        capsuleHalfHeight: { default: undefined },
        cylinderRadius: { default: undefined },
        cylinderHalfHeight: { default: undefined },
        linearVelocity: { type: "vector3", default: [0, 0, 0] },
        angularVelocity: { type: "vector3", default: [0, 0, 0] },
        collisionEnterEventName: { type: "string", default: "" },
        collisionExitEventName: { type: "string", default: "" },
        sensorEnterEventName: { type: "string", default: "" },
        sensorExitEventName: { type: "string", default: "" },
    },
};

export default CrashcatPhysicsComponent;
