"use client";

import { useFrame } from "@react-three/fiber";
import {
    addBroadphaseLayer,
    addObjectLayer,
    box,
    createWorld,
    createWorldSettings,
    enableCollision,
    filter,
    MotionQuality,
    MotionType,
    registerAll,
    rigidBody,
    sphere,
    triangleMesh,
    type Filter,
    type Listener,
    type RigidBody,
    type World,
    updateWorld,
} from "crashcat";
import { debugRenderer } from "crashcat/three";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from "react";
import { findComponent, gameEvents, PrefabEditorMode, useEditorContext, type GameObject, type PrefabEditorRef } from "react-three-game";
import { Box3, Matrix4, Object3D, Quaternion, Vector3 } from "three";

const bounds = new Box3();
const localBounds = new Box3();
const childBounds = new Box3();
const boundsSize = new Vector3();
const boundsCenter = new Vector3();
const bodyQuaternion = new Quaternion();
const inverseWorldMatrix = new Matrix4();
const childToLocalMatrix = new Matrix4();
const scratchVertex = new Vector3();

let didRegisterCrashcat = false;

function ensureCrashcatRegistered() {
    if (didRegisterCrashcat) return;
    registerAll();
    didRegisterCrashcat = true;
}

type CrashcatEventConfig = {
    collisionEnter?: string;
    collisionExit?: string;
};

type CrashcatColliderConfig = false | {
    shape?: "autoBox" | "box" | "sphere" | "trimesh";
    motionType?: "static" | "dynamic" | "kinematic";
    motionQuality?: "discrete" | "linearCast";
    sensor?: boolean;
    radius?: number;
    restitution?: number;
    friction?: number;
    linearVelocity?: [number, number, number];
};

type CrashcatNodeConfig = {
    autoStaticColliders?: boolean;
    excludeIds?: string[];
    collider?: CrashcatColliderConfig;
    events?: CrashcatEventConfig;
    player?: {
        eyeHeight?: number;
        radius?: number;
        halfHeightOfCylinder?: number;
        maxSpeed?: number;
        groundAccel?: number;
        airAccel?: number;
        friction?: number;
        jumpSpeed?: number;
    };
};

type BodyMeta = {
    nodeId: string;
    motionType: MotionType;
    events?: CrashcatEventConfig;
};

export interface CrashcatRuntimeRef {
    world: World | null;
    queryFilter: Filter | null;
    staticObjectLayer: number;
    movingObjectLayer: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickDefined<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));
}

function resolveCrashcatConfig(node: GameObject | null | undefined): CrashcatNodeConfig | null {
    const dataCrashcat = findComponent(node, "Data")?.properties?.data?.crashcat;
    const physics = findComponent(node, "CrashcatPhysics")?.properties;

    const config: CrashcatNodeConfig = {
        ...(isRecord(dataCrashcat) ? dataCrashcat as CrashcatNodeConfig : {}),
        ...(isRecord(physics)
            ? {
                collider: pickDefined({
                    shape: physics.shape,
                    motionType: physics.motionType,
                    motionQuality: physics.motionQuality,
                    sensor: physics.sensor,
                    radius: physics.radius,
                    restitution: physics.restitution,
                    friction: physics.friction,
                    linearVelocity: physics.linearVelocity,
                }) as Exclude<CrashcatColliderConfig, false>,
                events: pickDefined({
                    collisionEnter: typeof physics.collisionEnter === "string" ? physics.collisionEnter : undefined,
                    collisionExit: typeof physics.collisionExit === "string" ? physics.collisionExit : undefined,
                }) as CrashcatEventConfig,
            }
            : {}),
    };

    if (config.collider && !isRecord(config.collider)) {
        delete config.collider;
    }
    if (config.events && Object.keys(config.events).length === 0) {
        delete config.events;
    }

    return Object.keys(config).length > 0 ? config : null;
}

function getPrefabNodeId(object: Object3D | null | undefined) {
    return typeof object?.userData?.prefabNodeId === "string" ? object.userData.prefabNodeId : null;
}

function toMotionType(value: CrashcatColliderConfig extends infer T ? T : never): MotionType {
    const motionType = isRecord(value) ? value.motionType : undefined;
    if (motionType === "dynamic") return MotionType.DYNAMIC;
    if (motionType === "kinematic") return MotionType.KINEMATIC;
    return MotionType.STATIC;
}

function toMotionQuality(value: CrashcatColliderConfig extends infer T ? T : never): MotionQuality | undefined {
    const motionQuality = isRecord(value) ? value.motionQuality : undefined;
    if (motionQuality === "linearCast") return MotionQuality.LINEAR_CAST;
    if (motionQuality === "discrete") return MotionQuality.DISCRETE;
    return undefined;
}

function getLocalBounds(object: Object3D) {
    inverseWorldMatrix.copy(object.matrixWorld).invert();
    localBounds.makeEmpty();

    object.traverse((child) => {
        const geometry = (child as Object3D & { geometry?: { boundingBox?: Box3 | null; computeBoundingBox?: () => void } }).geometry;
        if (!geometry) return;

        if (!geometry.boundingBox) {
            geometry.computeBoundingBox?.();
        }

        if (!geometry.boundingBox) return;

        childToLocalMatrix.multiplyMatrices(inverseWorldMatrix, child.matrixWorld);
        childBounds.copy(geometry.boundingBox).applyMatrix4(childToLocalMatrix);
        localBounds.union(childBounds);
    });

    return localBounds.isEmpty() ? null : localBounds;
}

function collectGeometryData(object: Object3D) {
    const positions: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    inverseWorldMatrix.copy(object.matrixWorld).invert();

    object.traverse((child) => {
        const geometry = (child as Object3D & {
            geometry?: {
                attributes?: {
                    position?: {
                        count: number;
                        getX: (index: number) => number;
                        getY: (index: number) => number;
                        getZ: (index: number) => number;
                    };
                };
                index?: { count: number; getX: (index: number) => number } | null;
            };
        }).geometry;
        const positionAttribute = geometry?.attributes?.position;

        if (!positionAttribute) return;

        childToLocalMatrix.multiplyMatrices(inverseWorldMatrix, child.matrixWorld);

        for (let index = 0; index < positionAttribute.count; index += 1) {
            scratchVertex
                .set(positionAttribute.getX(index), positionAttribute.getY(index), positionAttribute.getZ(index))
                .applyMatrix4(childToLocalMatrix);
            positions.push(scratchVertex.x, scratchVertex.y, scratchVertex.z);
        }

        if (geometry.index) {
            for (let index = 0; index < geometry.index.count; index += 1) {
                indices.push(vertexOffset + geometry.index.getX(index));
            }
        } else {
            for (let index = 0; index < positionAttribute.count; index += 1) {
                indices.push(vertexOffset + index);
            }
        }

        vertexOffset += positionAttribute.count;
    });

    if (positions.length === 0 || indices.length < 3) {
        return null;
    }

    return { positions, indices };
}

function getBodyPosition(object: Object3D, objectBounds: Box3) {
    objectBounds.getCenter(boundsCenter).applyMatrix4(object.matrixWorld);
    return [boundsCenter.x, boundsCenter.y, boundsCenter.z] as [number, number, number];
}

function getBodyQuaternion(object: Object3D) {
    object.getWorldQuaternion(bodyQuaternion);
    return [bodyQuaternion.x, bodyQuaternion.y, bodyQuaternion.z, bodyQuaternion.w] as [number, number, number, number];
}

function createShapeForObject(object: Object3D, objectBounds: Box3, collider: Exclude<CrashcatColliderConfig, false>) {
    if (collider.shape === "trimesh") {
        const geometry = collectGeometryData(object);
        return geometry ? triangleMesh.create(geometry) : null;
    }

    objectBounds.getSize(boundsSize);

    if (collider.shape === "sphere") {
        const radius = collider.radius ?? Math.max(boundsSize.x, boundsSize.y, boundsSize.z) * 0.5;
        return sphere.create({ radius: Math.max(radius, 0.01) });
    }

    return box.create({
        halfExtents: [
            Math.max(boundsSize.x * 0.5, 0.01),
            Math.max(boundsSize.y * 0.5, 0.01),
            Math.max(boundsSize.z * 0.5, 0.01),
        ],
    });
}

function emitConfiguredEvent(eventName: string | undefined, sourceNodeId: string, targetNodeId: string | null) {
    const trimmed = eventName?.trim();
    if (!trimmed) return;

    gameEvents.emit(trimmed, {
        sourceEntityId: sourceNodeId,
        sourceNodeId,
        targetEntityId: targetNodeId,
        targetNodeId: targetNodeId,
    });
}

export const CrashcatRuntime = forwardRef<CrashcatRuntimeRef, {
    editorRef: RefObject<PrefabEditorRef | null>;
    debug?: boolean;
}>(({ editorRef, debug = false }, ref) => {
    const { mode } = useEditorContext();
    const worldRef = useRef<World | null>(null);
    const queryFilterRef = useRef<Filter | null>(null);
    const staticObjectLayerRef = useRef(-1);
    const movingObjectLayerRef = useRef(-1);
    const bodyIdByNodeIdRef = useRef(new Map<string, number>());
    const bodyMetaByIdRef = useRef(new Map<number, BodyMeta>());
    const debugStateRef = useRef<ReturnType<typeof debugRenderer.init> | null>(null);
    const editBodiesDirtyRef = useRef(false);
    const lastModeRef = useRef(mode);

    if (debug && !debugStateRef.current) {
        const options = debugRenderer.createDefaultOptions();
        options.bodies.wireframe = true;
        options.bodies.color = debugRenderer.BodyColorMode.MOTION_TYPE;
        options.bodies.showAngularVelocity = false;
        options.bodies.showLinearVelocity = false;
        options.contacts.enabled = false;
        options.contactConstraints.enabled = false;
        debugStateRef.current = debugRenderer.init(options);
    }

    const listener = useMemo<Listener>(() => ({
        onContactAdded: (bodyA, bodyB) => {
            const metaA = bodyMetaByIdRef.current.get(Number(bodyA.id));
            const metaB = bodyMetaByIdRef.current.get(Number(bodyB.id));
            if (metaA?.events) emitConfiguredEvent(metaA.events.collisionEnter, metaA.nodeId, metaB?.nodeId ?? null);
            if (metaB?.events) emitConfiguredEvent(metaB.events.collisionEnter, metaB.nodeId, metaA?.nodeId ?? null);
        },
        onContactRemoved: (bodyIdA, bodyIdB) => {
            const metaA = bodyMetaByIdRef.current.get(Number(bodyIdA));
            const metaB = bodyMetaByIdRef.current.get(Number(bodyIdB));
            if (metaA?.events) emitConfiguredEvent(metaA.events.collisionExit, metaA.nodeId, metaB?.nodeId ?? null);
            if (metaB?.events) emitConfiguredEvent(metaB.events.collisionExit, metaB.nodeId, metaA?.nodeId ?? null);
        },
    }), []);

    useEffect(() => {
        ensureCrashcatRegistered();

        const settings = createWorldSettings();
        const movingBroadphaseLayer = addBroadphaseLayer(settings);
        const staticBroadphaseLayer = addBroadphaseLayer(settings);
        movingObjectLayerRef.current = addObjectLayer(settings, movingBroadphaseLayer);
        staticObjectLayerRef.current = addObjectLayer(settings, staticBroadphaseLayer);
        enableCollision(settings, movingObjectLayerRef.current, staticObjectLayerRef.current);
        enableCollision(settings, movingObjectLayerRef.current, movingObjectLayerRef.current);

        const world = createWorld(settings);
        worldRef.current = world;
        queryFilterRef.current = filter.forWorld(world);

        return () => {
            if (debugStateRef.current) {
                debugRenderer.dispose(debugStateRef.current);
                debugStateRef.current = null;
            }
            worldRef.current = null;
            queryFilterRef.current = null;
            bodyIdByNodeIdRef.current.clear();
            bodyMetaByIdRef.current.clear();
        };
    }, []);

    useImperativeHandle(ref, () => ({
        get world() {
            return worldRef.current;
        },
        get queryFilter() {
            return queryFilterRef.current;
        },
        get staticObjectLayer() {
            return staticObjectLayerRef.current;
        },
        get movingObjectLayer() {
            return movingObjectLayerRef.current;
        },
    }), []);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        return editor.onSceneChange(() => {
            if (lastModeRef.current === PrefabEditorMode.Edit) {
                editBodiesDirtyRef.current = true;
            }
        });
    }, [editorRef]);

    useFrame((_, delta) => {
        const editor = editorRef.current;
        const world = worldRef.current;
        const queryFilter = queryFilterRef.current;
        const root = editor?.root;
        if (!editor || !world || !queryFilter || !root) return;

        if (mode !== lastModeRef.current) {
            if (lastModeRef.current === PrefabEditorMode.Edit) {
                editBodiesDirtyRef.current = true;
            }
            lastModeRef.current = mode;
        }

        if (editBodiesDirtyRef.current) {
            for (const bodyId of bodyIdByNodeIdRef.current.values()) {
                const body = rigidBody.get(world, bodyId);
                if (body) rigidBody.remove(world, body);
            }
            bodyIdByNodeIdRef.current.clear();
            bodyMetaByIdRef.current.clear();
            editBodiesDirtyRef.current = false;
        }

        const rootNode = editor.getNode(getPrefabNodeId(root) ?? "");
        const rootConfig = resolveCrashcatConfig(rootNode);
        const rootNodeId = getPrefabNodeId(root);
        const autoStaticColliders = Boolean(rootConfig?.autoStaticColliders);
        const excludedIds = new Set(rootConfig?.excludeIds ?? []);
        const seenNodeIds = new Set<string>();

        root.traverse((candidate) => {
            const nodeId = getPrefabNodeId(candidate);
            if (!nodeId || seenNodeIds.has(nodeId)) return;
            seenNodeIds.add(nodeId);

            const object = editor.getNodeObject(nodeId) ?? candidate;
            const node = editor.getNode(nodeId);
            const config = resolveCrashcatConfig(node);
            const explicitCollider = config?.collider;
            const allowAutoCollider = autoStaticColliders
                && !excludedIds.has(nodeId)
                && nodeId !== rootNodeId;
            const collider = explicitCollider === false
                ? null
                : explicitCollider && isRecord(explicitCollider)
                    ? explicitCollider as Exclude<CrashcatColliderConfig, false>
                    : allowAutoCollider
                        ? ({ motionType: "static", shape: "autoBox" } satisfies Exclude<CrashcatColliderConfig, false>)
                        : null;

            if (!collider || bodyIdByNodeIdRef.current.has(nodeId)) {
                return;
            }

            object.updateWorldMatrix(true, true);
            const objectBounds = getLocalBounds(object);
            if (!objectBounds) {
                return;
            }

            const shape = createShapeForObject(object, objectBounds, collider);
            const position = getBodyPosition(object, objectBounds);
            const quaternion = getBodyQuaternion(object);
            if (!shape || !position) {
                return;
            }

            const motionType = toMotionType(collider);
            const body = rigidBody.create(world, {
                shape,
                motionType,
                motionQuality: toMotionQuality(collider),
                objectLayer: motionType === MotionType.STATIC ? staticObjectLayerRef.current : movingObjectLayerRef.current,
                position,
                quaternion,
                sensor: Boolean(collider.sensor),
                friction: collider.friction,
                restitution: collider.restitution,
                userData: { nodeId },
            });

            if (collider.linearVelocity) {
                rigidBody.setLinearVelocity(world, body, collider.linearVelocity);
            }

            bodyIdByNodeIdRef.current.set(nodeId, Number(body.id));
            bodyMetaByIdRef.current.set(Number(body.id), {
                nodeId,
                motionType,
                events: config?.events,
            });
        });

        for (const [nodeId, bodyId] of bodyIdByNodeIdRef.current) {
            if (seenNodeIds.has(nodeId)) continue;

            const body = rigidBody.get(world, bodyId);
            if (body) rigidBody.remove(world, body);
            bodyIdByNodeIdRef.current.delete(nodeId);
            bodyMetaByIdRef.current.delete(bodyId);
        }

        updateWorld(world, listener, Math.min(delta, 1 / 30));
        if (debugStateRef.current) {
            debugRenderer.update(debugStateRef.current, world);
        }

        for (const [nodeId, bodyId] of bodyIdByNodeIdRef.current) {
            const body = rigidBody.get(world, bodyId);
            const meta = bodyMetaByIdRef.current.get(bodyId);
            const object = editor.getNodeObject(nodeId);
            if (!body || !meta || !object) continue;

            if (meta.motionType === MotionType.STATIC) continue;

            object.position.set(body.position[0], body.position[1], body.position[2]);
            object.quaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
            object.updateMatrixWorld();

            if (body.position[1] < -40) {
                rigidBody.remove(world, body);
                bodyIdByNodeIdRef.current.delete(nodeId);
                bodyMetaByIdRef.current.delete(bodyId);
                editor.deleteNode(nodeId);
            }
        }
    });

    return debug && mode === PrefabEditorMode.Edit && debugStateRef.current
        ? <primitive object={debugStateRef.current.object3d} />
        : null;
});

CrashcatRuntime.displayName = "CrashcatRuntime";
