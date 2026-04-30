"use client";

import { useFrame } from "@react-three/fiber";
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
    updateWorld,
} from "crashcat";
import { debugRenderer } from "crashcat/three";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { gameEvents } from "../../tools/prefabeditor/GameEvents";
import { PrefabEditorMode, useScene } from "../../tools/prefabeditor/PrefabRoot";

const SLEEP_TIME_BEFORE_REST = 0.1;
const SLEEP_POINT_VELOCITY_THRESHOLD = 0.06;
const MAX_PHYSICS_DELTA = 1 / 30;

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
    motionType: MotionType;
    sensor: boolean;
    events?: CrashcatEventConfig;
};

type BodyEntry = {
    body: RigidBody;
    meta: BodyMeta;
};

export interface CrashcatApi {
    world: World;
    queryFilter: Filter;
    staticObjectLayer: number;
    movingObjectLayer: number;
    register: (nodeId: string, body: RigidBody, meta: Omit<BodyMeta, "nodeId">) => void;
    unregister: (nodeId: string) => void;
    getBody: (nodeId: string) => RigidBody | null;
}

const crashcatListeners = new Set<() => void>();
let crashcatApi: CrashcatApi | null = null;

export function useCrashcat(): CrashcatApi | null {
    return useSyncExternalStore(
        (listener) => (crashcatListeners.add(listener), () => crashcatListeners.delete(listener)),
        () => crashcatApi,
        () => crashcatApi,
    );
}

function setCrashcatApi(api: CrashcatApi | null) {
    crashcatApi = api;
    crashcatListeners.forEach((listener) => listener());
}

function emitConfiguredEvent(eventName: string | undefined, sourceNodeId: string, targetNodeId: string | null, collisionNormal?: [number, number, number]) {
    const trimmed = eventName?.trim();
    if (!trimmed) return;
    gameEvents.emit(trimmed, {
        sourceEntityId: sourceNodeId,
        sourceNodeId,
        targetEntityId: targetNodeId,
        targetNodeId,
        ...(collisionNormal ? { collisionNormal } : {}),
    });
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
    const { mode } = useScene();
    const bodiesRef = useRef(new Map<string, BodyEntry>());
    const bodyByIdRef = useRef(new Map<number, BodyMeta>());
    const apiRef = useRef<CrashcatApi | null>(null);
    const [debugState] = useState(() => debug ? createDebugState() : null);

    const listener = useMemo<Listener>(() => ({
        onContactAdded: (bodyA, bodyB, manifold) => {
            const metaA = getBodyMeta(bodyByIdRef.current, bodyA);
            const metaB = getBodyMeta(bodyByIdRef.current, bodyB);
            const n = manifold?.worldSpaceNormal;
            const nA = n ? [n[0], n[1], n[2]] as [number, number, number] : undefined;
            const nB = n ? [-n[0], -n[1], -n[2]] as [number, number, number] : undefined;
            if (metaA?.events) emitConfiguredEvent(metaA.sensor ? metaA.events.sensorEnter : metaA.events.collisionEnter, metaA.nodeId, metaB?.nodeId ?? null, nA);
            if (metaB?.events) emitConfiguredEvent(metaB.sensor ? metaB.events.sensorEnter : metaB.events.collisionEnter, metaB.nodeId, metaA?.nodeId ?? null, nB);
        },
        onContactRemoved: (idA, idB) => {
            const metaA = bodyByIdRef.current.get(Number(idA));
            const metaB = bodyByIdRef.current.get(Number(idB));
            if (metaA?.events) emitConfiguredEvent(metaA.sensor ? metaA.events.sensorExit : metaA.events.collisionExit, metaA.nodeId, metaB?.nodeId ?? null);
            if (metaB?.events) emitConfiguredEvent(metaB.sensor ? metaB.events.sensorExit : metaB.events.collisionExit, metaB.nodeId, metaA?.nodeId ?? null);
        },
    }), []);

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
        const bodies = bodiesRef.current;
        const bodyById = bodyByIdRef.current;

        const unregister = (nodeId: string) => {
            const entry = bodies.get(nodeId);
            if (!entry) return;
            bodyById.delete(Number(entry.body.id));
            rigidBody.remove(world, entry.body);
            bodies.delete(nodeId);
        };

        const runtimeApi: CrashcatApi = {
            world,
            queryFilter,
            staticObjectLayer,
            movingObjectLayer,
            register: (nodeId, body, meta) => {
                unregister(nodeId);
                const full: BodyMeta = { nodeId, ...meta };
                bodies.set(nodeId, { body, meta: full });
                bodyById.set(Number(body.id), full);
            },
            unregister,
            getBody: (nodeId) => bodies.get(nodeId)?.body ?? null,
        };

        apiRef.current = runtimeApi;
        setCrashcatApi(runtimeApi);

        return () => {
            for (const entry of bodies.values()) {
                rigidBody.remove(world, entry.body);
            }
            apiRef.current = null;
            if (crashcatApi === runtimeApi) setCrashcatApi(null);
            bodies.clear();
            bodyById.clear();
            if (debugState) debugRenderer.dispose(debugState);
        };
    }, [debugState]);

    useFrame((_, delta) => {
        const runtimeApi = apiRef.current;
        if (!runtimeApi) return;
        const { world } = runtimeApi;
        const stepDelta = Math.min(delta, MAX_PHYSICS_DELTA);

        if (mode === PrefabEditorMode.Play) updateWorld(world, listener, stepDelta);
        if (debugState) debugRenderer.update(debugState, world);
    }, -1);

    return (
        <>
            {children}
            {debugState && mode === PrefabEditorMode.Edit
                ? <primitive object={debugState.object3d} />
                : null}
        </>
    );
}
