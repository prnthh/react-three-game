"use client";

import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { capsule, kcc } from "crashcat";
import { useEffect, useRef } from "react";
import { gameEvents, PrefabEditorMode, useEditorContext, type PrefabEditorRef } from "react-three-game";
import type { CrashcatRuntimeRef } from "../../components/CrashcatRuntime";
import type { Object3D } from "three";
import { Vector3 } from "three";

const DEFAULT_MAX_SPEED = 7;
const DEFAULT_GROUND_ACCEL = 18;
const DEFAULT_AIR_ACCEL = 6;
const DEFAULT_FRICTION = 10;
const DEFAULT_JUMP_SPEED = 6.5;
const DEFAULT_FOOTSTEP_EVENT = "player:footstep";
const DEFAULT_FOOTSTEP_MIN_INTERVAL = 0.28;
const DEFAULT_FOOTSTEP_MAX_INTERVAL = 0.48;
const DEFAULT_FOOTSTEP_MIN_SPEED = 1.5;
const DEFAULT_RADIUS = 0.35;
const DEFAULT_HALF_HEIGHT = 0.45;
const GRAVITY: [number, number, number] = [0, -9.81, 0];

const forwardKeys = new Set(["KeyW", "ArrowUp"]);
const backwardKeys = new Set(["KeyS", "ArrowDown"]);
const leftKeys = new Set(["KeyA", "ArrowLeft"]);
const rightKeys = new Set(["KeyD", "ArrowRight"]);

const forwardVector = new Vector3();
const rightVector = new Vector3();
const wishVector = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const worldPosition = new Vector3();
const localPosition = new Vector3();

type PlayerRuntimeSettings = {
    radius?: number;
    halfHeightOfCylinder?: number;
    maxSpeed?: number;
    groundAccel?: number;
    airAccel?: number;
    friction?: number;
    jumpSpeed?: number;
    footstepEventName?: string;
    footstepMinInterval?: number;
    footstepMaxInterval?: number;
    footstepMinSpeed?: number;
};

function readPlayerSettings(playerObject: Object3D | null | undefined): Required<PlayerRuntimeSettings> {
    const value = playerObject?.userData?.crashcat?.player;
    const settings = value && typeof value === "object" ? value as PlayerRuntimeSettings : {};

    return {
        radius: settings.radius ?? DEFAULT_RADIUS,
        halfHeightOfCylinder: settings.halfHeightOfCylinder ?? DEFAULT_HALF_HEIGHT,
        maxSpeed: settings.maxSpeed ?? DEFAULT_MAX_SPEED,
        groundAccel: settings.groundAccel ?? DEFAULT_GROUND_ACCEL,
        airAccel: settings.airAccel ?? DEFAULT_AIR_ACCEL,
        friction: settings.friction ?? DEFAULT_FRICTION,
        jumpSpeed: settings.jumpSpeed ?? DEFAULT_JUMP_SPEED,
        footstepEventName: settings.footstepEventName ?? DEFAULT_FOOTSTEP_EVENT,
        footstepMinInterval: settings.footstepMinInterval ?? DEFAULT_FOOTSTEP_MIN_INTERVAL,
        footstepMaxInterval: settings.footstepMaxInterval ?? DEFAULT_FOOTSTEP_MAX_INTERVAL,
        footstepMinSpeed: settings.footstepMinSpeed ?? DEFAULT_FOOTSTEP_MIN_SPEED,
    };
}

function moveToward(current: number, target: number, maxDelta: number) {
    if (current < target) return Math.min(current + maxDelta, target);
    if (current > target) return Math.max(current - maxDelta, target);
    return current;
}

function hasPressedKey(pressedKeys: Set<string>, keys: Set<string>) {
    for (const key of keys) {
        if (pressedKeys.has(key)) return true;
    }
    return false;
}

export default function FirstPersonPlayer({
    editorRef,
    runtimeRef,
    playerId = "player",
}: {
    editorRef: React.RefObject<PrefabEditorRef | null>;
    runtimeRef: React.RefObject<CrashcatRuntimeRef | null>;
    playerId?: string;
}) {
    const { mode } = useEditorContext();
    const planarVelocityRef = useRef(new Vector3());
    const footstepTimerRef = useRef(0);
    const characterRef = useRef<ReturnType<typeof kcc.create> | null>(null);
    const updateSettingsRef = useRef(kcc.createDefaultUpdateSettings());
    const pressedKeysRef = useRef(new Set<string>());
    const jumpQueuedRef = useRef(false);
    const { camera } = useThree();

    useEffect(() => {
        const setKey = (pressed: boolean) => (event: KeyboardEvent) => {
            if (event.code === "Space") {
                if (pressed && !event.repeat) {
                    jumpQueuedRef.current = true;
                }
                return;
            }

            if (!forwardKeys.has(event.code)
                && !backwardKeys.has(event.code)
                && !leftKeys.has(event.code)
                && !rightKeys.has(event.code)) {
                return;
            }

            if (pressed) {
                pressedKeysRef.current.add(event.code);
            } else {
                pressedKeysRef.current.delete(event.code);
            }
        };

        const handleKeyDown = setKey(true);
        const handleKeyUp = setKey(false);
        const clearInput = () => {
            pressedKeysRef.current.clear();
            jumpQueuedRef.current = false;
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", clearInput);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", clearInput);
        };
    }, []);

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;

        const editor = editorRef.current;
        const runtime = runtimeRef.current;
        const world = runtime?.world;
        const queryFilter = runtime?.queryFilter;
        if (!editor || !world || !queryFilter) return;

        const playerObject = editor.getNodeObject(playerId);
        if (!playerObject) return;

        const settings = readPlayerSettings(playerObject);
        playerObject.getWorldPosition(worldPosition);

        if (!characterRef.current) {
            planarVelocityRef.current.set(0, 0, 0);
            footstepTimerRef.current = 0;
            jumpQueuedRef.current = false;
            characterRef.current = kcc.create({
                shape: capsule.create({
                    radius: settings.radius,
                    halfHeightOfCylinder: settings.halfHeightOfCylinder,
                }),
                maxSlopeAngle: Math.PI / 3,
                characterPadding: 0.02,
            }, [worldPosition.x, worldPosition.y, worldPosition.z], [0, 0, 0, 1]);
        }

        const character = characterRef.current;
        const pressedKeys = pressedKeysRef.current;
        const forwardInput = Number(hasPressedKey(pressedKeys, forwardKeys)) - Number(hasPressedKey(pressedKeys, backwardKeys));
        const rightInput = Number(hasPressedKey(pressedKeys, rightKeys)) - Number(hasPressedKey(pressedKeys, leftKeys));

        camera.getWorldDirection(forwardVector);
        forwardVector.y = 0;

        if (forwardVector.lengthSq() < 1e-6) {
            forwardVector.set(0, 0, -1);
        } else {
            forwardVector.normalize();
        }

        rightVector.crossVectors(forwardVector, worldUp).normalize();

        wishVector
            .copy(forwardVector)
            .multiplyScalar(forwardInput)
            .addScaledVector(rightVector, rightInput);

        const stepDelta = Math.min(delta, 1 / 30);
        kcc.refreshContacts(world, character, queryFilter);
        const grounded = kcc.isSupported(character);
        const planarVelocity = planarVelocityRef.current;
        const currentVelocityY = character.linearVelocity[1];

        const desiredPlanarSpeed = wishVector.lengthSq() > 0
            ? wishVector.normalize().multiplyScalar(settings.maxSpeed)
            : wishVector.set(0, 0, 0);

        const accel = grounded ? settings.groundAccel : settings.airAccel;
        const maxDelta = accel * delta;
        planarVelocity.set(
            moveToward(planarVelocity.x, desiredPlanarSpeed.x, maxDelta),
            0,
            moveToward(planarVelocity.z, desiredPlanarSpeed.z, maxDelta),
        );

        if (grounded && planarVelocity.lengthSq() > 0 && desiredPlanarSpeed.lengthSq() === 0) {
            const damping = Math.max(0, 1 - settings.friction * delta * 0.1);
            planarVelocity.multiplyScalar(damping);
        }

        if (grounded && jumpQueuedRef.current) {
            character.linearVelocity[1] = settings.jumpSpeed;
            jumpQueuedRef.current = false;
        } else {
            character.linearVelocity[1] = grounded
                ? (currentVelocityY < 0 ? 0 : currentVelocityY)
                : currentVelocityY + GRAVITY[1] * stepDelta;
        }

        character.linearVelocity[0] = planarVelocity.x;
        character.linearVelocity[2] = planarVelocity.z;

        kcc.update(world, character, stepDelta, GRAVITY, updateSettingsRef.current, undefined, queryFilter);

        const speed = planarVelocity.length();
        const moving = grounded && desiredPlanarSpeed.lengthSq() > 0 && speed > settings.footstepMinSpeed;

        if (!moving) {
            footstepTimerRef.current = 0;
        } else {
            footstepTimerRef.current -= delta;

            if (footstepTimerRef.current <= 0) {
                gameEvents.emit(settings.footstepEventName, {
                    nodeId: "player-footsteps",
                    sourceEntityId: playerId,
                    sourceNodeId: playerId,
                    speed,
                });

                const speedAlpha = Math.min(speed / settings.maxSpeed, 1);
                footstepTimerRef.current = settings.footstepMaxInterval - (settings.footstepMaxInterval - settings.footstepMinInterval) * speedAlpha;
            }
        }

        worldPosition.set(character.position[0], character.position[1], character.position[2]);
        if (playerObject.parent) {
            localPosition.copy(worldPosition);
            playerObject.parent.worldToLocal(localPosition);
            playerObject.position.copy(localPosition);
        } else {
            playerObject.position.copy(worldPosition);
        }
        playerObject.updateMatrixWorld(true);
    });

    return mode === PrefabEditorMode.Play ? <PointerLockControls makeDefault /> : null;
}
