"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useStore } from "zustand";

import { type Component, type ComponentViewProps } from "../../tools/prefabeditor/components/ComponentRegistry";

import { useModelAsset } from "../../tools/prefabeditor/assetRuntime";

import { useNode, usePrefab } from "../../tools/prefabeditor/SceneContext";

import { usePrefabStoreApi } from "../../tools/prefabeditor/prefabStore";

import { withBasePath } from "../../tools/prefabeditor/runtimeUtils";

import { MotionQuality, MotionType, rigidBody, type RigidBody, type World } from "crashcat";

import { Quaternion, Vector3 } from "three";

import type { Object3D } from "three";

import { useCrashcat, type CrashcatApi, type CrashcatBodySync } from "./CrashcatRuntime";

import { createShapeForObject } from "./collisionShapes";
import { moveKinematicBody } from "./kinematic";

export type CrashcatPhysicsProperties = {
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

const scratchPosition = new Vector3();
const worldQuaternion = new Quaternion();
const parentWorldQuaternion = new Quaternion();
const localQuaternion = new Quaternion();

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

function syncObjectToBody(world: World, body: RigidBody, object: Object3D, position: [number, number, number], quaternion: [number, number, number, number], delta: number) {
    object.getWorldPosition(scratchPosition);
    object.getWorldQuaternion(worldQuaternion);
    position.splice(0, 3, scratchPosition.x, scratchPosition.y, scratchPosition.z);
    quaternion.splice(0, 4, worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w);

    moveKinematicBody(world, body, position, quaternion, delta);
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
    const api = useCrashcat();
    const { basePath } = usePrefab();
    const store = usePrefabStoreApi();
    const node = useStore(store, useCallback(state => state.nodesById[nodeId], [nodeId]));
    const modelPath = useMemo(() => {
        const filename = Object.values(node?.components ?? {}).find(component => component?.type === "Model")
            ?.properties?.filename as string | undefined;
        return filename ? withBasePath(basePath ?? "", filename) : null;
    }, [basePath, node]);
    const loadedModel = useModelAsset(modelPath);
    const syncPositionRef = useRef<[number, number, number]>([0, 0, 0]);
    const syncQuaternionRef = useRef<[number, number, number, number]>([0, 0, 0, 1]);
    const lastPositionRef = useRef<[number, number, number] | null>(null);
    const lastQuaternionRef = useRef<[number, number, number, number] | null>(null);
    const physics = properties;

    useEffect(() => {
        // Rebuild from current geometry when authored node data or its model changes.
        void loadedModel;
        if (!api) return;
        const object = getObject();
        if (!object) return;

        const motionType = toMotionType(physics);
        const sync: CrashcatBodySync = {};

        if (physics.type === "kinematicPosition") {
            sync.beforeStep = (body, delta) => {
                const currentObject = getObject();
                if (!currentObject) return;
                syncObjectToBody(api.world, body, currentObject, syncPositionRef.current, syncQuaternionRef.current, delta);
            };
        } else if (motionType !== MotionType.STATIC) {
            sync.afterStep = (body) => {
                const currentObject = getObject();
                if (!currentObject) return;

                if (bodyTransformChanged(body, lastPositionRef.current, lastQuaternionRef.current)) {
                    setObjectWorldTransform(currentObject, body.position, body.quaternion);
                    lastPositionRef.current = [body.position[0], body.position[1], body.position[2]];
                    lastQuaternionRef.current = [body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]];
                }

            };
        }

        createAndRegisterBody(api, runtimeNodeId, object, physics, sync);
        lastPositionRef.current = null;
        lastQuaternionRef.current = null;
        return () => api.unregister(runtimeNodeId);
    }, [
        api,
        getObject,
        runtimeNodeId,
        physics,
        node,
        loadedModel,
    ]);

    return <>{children}</>;
}

const CrashcatPhysicsComponent: Component<CrashcatPhysicsProperties> = {
    name: "CrashcatPhysics",
    View: CrashcatPhysicsView,
    properties: {
        type: {
            type: "select",
            default: "fixed",
            label: "Motion Type",
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
        sensor: { type: "boolean", default: false },
        friction: { default: undefined, step: 0.05 },
        restitution: { default: undefined, step: 0.05 },
        capsuleRadius: { default: undefined, step: 0.05 },
        capsuleHalfHeight: { default: undefined, step: 0.05 },
        cylinderRadius: { default: undefined, step: 0.05 },
        cylinderHalfHeight: { default: undefined, step: 0.05 },
        linearVelocity: { type: "vector3", default: [0, 0, 0] },
        angularVelocity: { type: "vector3", default: [0, 0, 0] },
        collisionEnterEventName: { type: "string", default: "", label: "Collision Enter" },
        collisionExitEventName: { type: "string", default: "", label: "Collision Exit" },
        sensorEnterEventName: { type: "string", default: "", label: "Sensor Enter" },
        sensorExitEventName: { type: "string", default: "", label: "Sensor Exit" },
    },
};

export default CrashcatPhysicsComponent;
