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
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { gameEvents, PrefabEditorMode, useScene } from "react-three-game";
import { Object3D, Quaternion, Vector3 } from "three";

const SLEEP_TIME_BEFORE_REST = 0.1;
const SLEEP_POINT_VELOCITY_THRESHOLD = 0.06;

const scratchPosition = new Vector3();
const worldQuaternion = new Quaternion();
const parentWorldQuaternion = new Quaternion();
const localQuaternion = new Quaternion();

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

export interface CrashcatApi {
    world: World;
    queryFilter: Filter;
    staticObjectLayer: number;
    movingObjectLayer: number;
    register: (nodeId: string, body: RigidBody, meta: Omit<BodyMeta, "nodeId">) => void;
    unregister: (nodeId: string) => void;
    getBody: (nodeId: string) => RigidBody | null;
}

const CRASHCAT_API_LISTENERS = new Set<() => void>();
let CRASHCAT_API: CrashcatApi | null = null;

function setCrashcatApi(next: CrashcatApi | null) {
    CRASHCAT_API = next;
    CRASHCAT_API_LISTENERS.forEach((l) => l());
}

function subscribeCrashcat(listener: () => void) {
    CRASHCAT_API_LISTENERS.add(listener);
    return () => CRASHCAT_API_LISTENERS.delete(listener);
}

function getCrashcatSnapshot() {
    return CRASHCAT_API;
}

export function useCrashcat(): CrashcatApi | null {
    return useSyncExternalStore(subscribeCrashcat, getCrashcatSnapshot, getCrashcatSnapshot);
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

export function CrashcatRuntime({ debug = false, children }: { debug?: boolean; children?: React.ReactNode }) {
    const scene = useScene();
    const mode = scene.mode;
    const bodiesRef = useRef(new Map<string, { body: RigidBody; meta: BodyMeta }>());
    const bodyByIdRef = useRef(new Map<number, BodyMeta>());
    const api = useSyncExternalStore(subscribeCrashcat, getCrashcatSnapshot, getCrashcatSnapshot);
    const debugStateRef = useRef<ReturnType<typeof debugRenderer.init> | null>(null);

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
        onContactAdded: (bodyA, bodyB, manifold) => {
            const metaA = bodyByIdRef.current.get(Number(bodyA.id));
            const metaB = bodyByIdRef.current.get(Number(bodyB.id));
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

        setCrashcatApi({
            world,
            queryFilter,
            staticObjectLayer,
            movingObjectLayer,
            register: (nodeId, body, meta) => {
                const full: BodyMeta = { nodeId, ...meta };
                bodies.set(nodeId, { body, meta: full });
                bodyById.set(Number(body.id), full);
            },
            unregister: (nodeId) => {
                const entry = bodies.get(nodeId);
                if (!entry) return;
                bodyById.delete(Number(entry.body.id));
                rigidBody.remove(world, entry.body);
                bodies.delete(nodeId);
            },
            getBody: (nodeId) => bodies.get(nodeId)?.body ?? null,
        });

        return () => {
            setCrashcatApi(null);
            bodies.clear();
            bodyById.clear();
            if (debugStateRef.current) {
                debugRenderer.dispose(debugStateRef.current);
                debugStateRef.current = null;
            }
        };
    }, []);

    useFrame((_, delta) => {
        if (!api) return;
        const { world } = api;

        if (mode === PrefabEditorMode.Edit) {
            // Mirror authored transforms onto the bodies so debug boxes follow live edits.
            for (const [nodeId, entry] of bodiesRef.current) {
                const object = scene.getObject(nodeId);
                if (!object) continue;
                object.getWorldPosition(scratchPosition);
                object.getWorldQuaternion(worldQuaternion);
                rigidBody.setPosition(world, entry.body, [scratchPosition.x, scratchPosition.y, scratchPosition.z], false);
                rigidBody.setQuaternion(world, entry.body, [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w], false);
            }
        } else {
            for (const [nodeId, entry] of bodiesRef.current) {
                if (entry.meta.motionType !== MotionType.KINEMATIC) continue;
                const object = scene.getObject(nodeId);
                if (!object) continue;
                object.getWorldPosition(scratchPosition);
                object.getWorldQuaternion(worldQuaternion);
                rigidBody.moveKinematic(
                    entry.body,
                    [scratchPosition.x, scratchPosition.y, scratchPosition.z],
                    [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w],
                    delta,
                );
            }
            updateWorld(world, listener, delta);

            for (const [nodeId, entry] of bodiesRef.current) {
                if (entry.meta.motionType !== MotionType.DYNAMIC) continue;
                const object = scene.getObject(nodeId);
                if (!object) continue;
                setObjectWorldTransform(object, entry.body.position, entry.body.quaternion);
                if (entry.body.position[1] < -40) api.unregister(nodeId);
            }
        }

        if (debugStateRef.current) debugRenderer.update(debugStateRef.current, world);
    });

    return (
        <>
            {children}
            {debug && mode === PrefabEditorMode.Edit && debugStateRef.current
                ? <primitive object={debugStateRef.current.object3d} />
                : null}
        </>
    );
}
