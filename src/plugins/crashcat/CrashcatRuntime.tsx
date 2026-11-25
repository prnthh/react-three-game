"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
    addBroadphaseLayer,
    addObjectLayer,
    createWorld,
    createWorldSettings,
    enableCollision,
    filter,
    MotionType,
    registerAll,
    rigidBody,
    type Filter,
    type Listener,
    type RigidBody,
    type World,
} from "crashcat";
import { getPhysicsScene } from "./physicsScene.js";
import { CrashcatBodyUpdates, type CrashcatBodySync } from "./bodySync.js";
import { debugRenderer } from "crashcat/three";
import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Object3D } from "three";
import { useGameEvents, type GameEvents } from "../../runtime/scene/GameEvents.js";
import type { ContactEventPayload } from "../../runtime/scene/GameEvents.js";
import { PrefabEditorMode, SceneContext } from "../../runtime/scene/SceneContext.js";

const SLEEP_TIME_BEFORE_REST = 0.1;
const SLEEP_POINT_VELOCITY_THRESHOLD = 0.06;

let didRegisterCrashcat = false;
function ensureCrashcatRegistered() {
    if (didRegisterCrashcat) return;
    registerAll();
    didRegisterCrashcat = true;
}

export type CrashcatEventConfig = {
    collisionEnter?: string;
    collisionExit?: string;
    sensorEnter?: string;
    sensorExit?: string;
};

export type BodyMeta = {
    nodeId: string;
    object?: Object3D;
    motionType: MotionType;
    sensor: boolean;
    events?: CrashcatEventConfig;
};

export type { CrashcatBodySync } from "./bodySync.js";

export interface CrashcatApi {
    world: World;
    queryFilter: Filter;
    staticObjectLayer: number;
    movingObjectLayer: number;
    register: (nodeId: string, body: RigidBody, meta: Omit<BodyMeta, "nodeId">, sync?: CrashcatBodySync) => void;
    unregister: (nodeId: string) => void;
    getBody: (nodeId: string) => RigidBody | null;
    /** Queue a render pose after teleporting a sleeping body with wake=false. */
    invalidateBodyPose: (body: RigidBody) => void;
}

export function useCrashcat(): CrashcatApi | null {
    const state = getPhysicsScene(useThree(state => state.scene));
    return useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);
}

function emitPhysicsEvent(
    gameEvents: GameEvents,
    eventType: "collision:enter" | "collision:exit" | "sensor:enter" | "sensor:exit",
    eventName: string | undefined,
    source: BodyMeta,
    target: BodyMeta | null | undefined,
    collisionNormal?: [number, number, number],
) {
    const alias = eventName?.trim();
    if (!gameEvents.hasListeners(eventType) && (!alias || !gameEvents.hasListeners(alias))) return;

    const payload: ContactEventPayload = {
        sourceEntityId: source.nodeId,
        sourceNodeId: source.nodeId,
        sourceObject: source.object,
        targetEntityId: target?.nodeId ?? null,
        targetNodeId: target?.nodeId ?? null,
        targetObject: target?.object,
        ...(collisionNormal ? { collisionNormal } : {}),
    };

    gameEvents.emit(eventType, payload);
    if (alias) gameEvents.emit(alias, payload);
}

function createDebugState() {
    const options = debugRenderer.createDefaultOptions();
    options.bodies.wireframe = true;
    options.bodies.color = debugRenderer.BodyColorMode.MOTION_TYPE;
    options.bodies.showAngularVelocity = false;
    options.bodies.showLinearVelocity = false;
    options.contacts.enabled = false;
    options.contactConstraints.enabled = false;
    return debugRenderer.init(options);
}

function getBodyMeta(bodyById: Map<number, BodyMeta>, body: RigidBody): BodyMeta | null {
    const registered = bodyById.get(Number(body.id));
    if (registered) return registered;

    const nodeId = (body.userData as { nodeId?: unknown } | null)?.nodeId;
    if (typeof nodeId !== "string") return null;

    return {
        nodeId,
        motionType: body.motionType,
        sensor: body.sensor,
    };
}

export function CrashcatRuntime({ debug = false, children }: { debug?: boolean; children?: React.ReactNode }) {
    const gameEvents = useGameEvents();
    const mode = useContext(SceneContext)?.mode ?? PrefabEditorMode.Play;
    const physicsScene = getPhysicsScene(useThree(state => state.scene));
    const [updates] = useState(() => new CrashcatBodyUpdates());
    const bodyByIdRef = useRef(new Map<number, BodyMeta>());
    const apiRef = useRef<CrashcatApi | null>(null);
    const debugStateRef = useRef<ReturnType<typeof createDebugState> | null>(null);
    const [debugObject, setDebugObject] = useState<Object3D | null>(null);

    const listener = useMemo<Listener>(() => ({
        onContactAdded: (bodyA, bodyB, manifold) => {
            const metaA = getBodyMeta(bodyByIdRef.current, bodyA);
            const metaB = getBodyMeta(bodyByIdRef.current, bodyB);
            const n = manifold?.worldSpaceNormal;
            const nA = n ? [n[0], n[1], n[2]] as [number, number, number] : undefined;
            const nB = n ? [-n[0], -n[1], -n[2]] as [number, number, number] : undefined;
            if (metaA) emitPhysicsEvent(gameEvents, metaA.sensor ? "sensor:enter" : "collision:enter", metaA.sensor ? metaA.events?.sensorEnter : metaA.events?.collisionEnter, metaA, metaB, nA);
            if (metaB) emitPhysicsEvent(gameEvents, metaB.sensor ? "sensor:enter" : "collision:enter", metaB.sensor ? metaB.events?.sensorEnter : metaB.events?.collisionEnter, metaB, metaA, nB);
        },
        onContactRemoved: (idA, idB) => {
            const metaA = bodyByIdRef.current.get(Number(idA));
            const metaB = bodyByIdRef.current.get(Number(idB));
            if (metaA) emitPhysicsEvent(gameEvents, metaA.sensor ? "sensor:exit" : "collision:exit", metaA.sensor ? metaA.events?.sensorExit : metaA.events?.collisionExit, metaA, metaB);
            if (metaB) emitPhysicsEvent(gameEvents, metaB.sensor ? "sensor:exit" : "collision:exit", metaB.sensor ? metaB.events?.sensorExit : metaB.events?.collisionExit, metaB, metaA);
        },
        onBodyPairValidate: (bodyA, bodyB) => !rigidBody.bodiesShareConstraint(bodyA, bodyB),
    }), [gameEvents]);

    useEffect(() => {
        ensureCrashcatRegistered();

        const settings = createWorldSettings();
        settings.narrowphase.collideWithBackfaces = true;
        settings.sleeping.timeBeforeSleep = SLEEP_TIME_BEFORE_REST;
        settings.sleeping.pointVelocitySleepThreshold = SLEEP_POINT_VELOCITY_THRESHOLD;
        const movingBroadphase = addBroadphaseLayer(settings);
        const staticBroadphase = addBroadphaseLayer(settings);
        const movingObjectLayer = addObjectLayer(settings, movingBroadphase);
        const staticObjectLayer = addObjectLayer(settings, staticBroadphase);
        enableCollision(settings, movingObjectLayer, staticObjectLayer);
        enableCollision(settings, movingObjectLayer, movingObjectLayer);

        const world = createWorld(settings);
        const queryFilter = filter.forWorld(world);
        const bodies = new Map<string, RigidBody>();
        const bodyById = bodyByIdRef.current;

        const unregister = (nodeId: string) => {
            const body = bodies.get(nodeId);
            if (!body) return;
            updates.remove(body);
            bodyById.delete(Number(body.id));
            rigidBody.remove(world, body);
            bodies.delete(nodeId);
        };

        const runtimeApi: CrashcatApi = {
            world,
            queryFilter,
            staticObjectLayer,
            movingObjectLayer,
            register: (nodeId, body, meta, sync) => {
                unregister(nodeId);
                const full: BodyMeta = { nodeId, ...meta };
                bodies.set(nodeId, body);
                bodyById.set(Number(body.id), full);
                updates.register(body, sync);
            },
            unregister,
            getBody: (nodeId) => bodies.get(nodeId) ?? null,
            invalidateBodyPose: updates.invalidatePose,
        };

        apiRef.current = runtimeApi;
        const unregisterRuntime = physicsScene.register(runtimeApi);

        return () => {
            apiRef.current = null;
            unregisterRuntime();
            for (const id of bodies.keys()) unregister(id);
        };
    }, [listener, physicsScene, updates]);

    useEffect(() => {
        if (!debug) return;
        const state = createDebugState();
        debugStateRef.current = state;
        setDebugObject(state.object3d);
        return () => {
            debugStateRef.current = null;
            setDebugObject(null);
            debugRenderer.dispose(state);
        };
    }, [debug]);

    useFrame((_, delta) => {
        const runtimeApi = apiRef.current;
        if (!runtimeApi) return;
        const { world } = runtimeApi;
        if (mode === PrefabEditorMode.Play) updates.step(world, listener, delta);

        const debugState = debugStateRef.current;
        if (debugState) debugRenderer.update(debugState, world);
    }, -1);

    return (
        <>
            {children}
            {debugObject
                ? <primitive object={debugObject} dispose={null} />
                : null}
        </>
    );
}
