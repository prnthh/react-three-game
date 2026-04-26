"use client";

import { PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { capsule, kcc } from "crashcat";
import { useEffect, useRef } from "react";
import { gameEvents, PrefabEditorMode, useScene } from "react-three-game";
import { Vector3 } from "three";
import { useCrashcat } from "../../components/CrashcatRuntime";

export interface FirstPersonPlayerProps {
    nodeId: string;
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
}

const DEFAULTS = {
    radius: 0.35,
    halfHeightOfCylinder: 0.45,
    maxSpeed: 7,
    groundAccel: 18,
    airAccel: 6,
    friction: 10,
    jumpSpeed: 6.5,
    footstepEventName: "player:footstep",
    footstepMinInterval: 0.28,
    footstepMaxInterval: 0.48,
    footstepMinSpeed: 1.5,
};

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

function moveToward(current: number, target: number, maxDelta: number) {
    if (current < target) return Math.min(current + maxDelta, target);
    if (current > target) return Math.max(current - maxDelta, target);
    return current;
}

function pressed(keys: Set<string>, group: Set<string>) {
    for (const k of group) if (keys.has(k)) return true;
    return false;
}

export default function FirstPersonPlayer(props: FirstPersonPlayerProps) {
    const settings = { ...DEFAULTS, ...props };
    const scene = useScene();
    const crashcat = useCrashcat();
    const { camera } = useThree();
    const planarVelocityRef = useRef(new Vector3());
    const footstepTimerRef = useRef(0);
    const characterRef = useRef<ReturnType<typeof kcc.create> | null>(null);
    const updateSettingsRef = useRef(kcc.createDefaultUpdateSettings());
    const pressedKeysRef = useRef(new Set<string>());
    const jumpQueuedRef = useRef(false);
    const playMode = scene.mode === PrefabEditorMode.Play;

    useEffect(() => {
        return () => {
            characterRef.current = null;
            planarVelocityRef.current.set(0, 0, 0);
        };
    }, [crashcat, playMode]);

    useEffect(() => {
        if (!playMode) return;

        const setKey = (down: boolean) => (event: KeyboardEvent) => {
            if (event.code === "Space") {
                if (down && !event.repeat) jumpQueuedRef.current = true;
                return;
            }
            if (!forwardKeys.has(event.code) && !backwardKeys.has(event.code)
                && !leftKeys.has(event.code) && !rightKeys.has(event.code)) return;
            if (down) pressedKeysRef.current.add(event.code);
            else pressedKeysRef.current.delete(event.code);
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
    }, [playMode]);

    useFrame((_, delta) => {
        if (!playMode || !crashcat) return;

        const playerObject = scene.getObject(props.nodeId);
        if (!playerObject) return;

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
        const keys = pressedKeysRef.current;
        const forwardInput = Number(pressed(keys, forwardKeys)) - Number(pressed(keys, backwardKeys));
        const rightInput = Number(pressed(keys, rightKeys)) - Number(pressed(keys, leftKeys));

        camera.getWorldDirection(forwardVector);
        forwardVector.y = 0;
        if (forwardVector.lengthSq() < 1e-6) forwardVector.set(0, 0, -1);
        else forwardVector.normalize();
        rightVector.crossVectors(forwardVector, worldUp).normalize();

        wishVector.copy(forwardVector).multiplyScalar(forwardInput).addScaledVector(rightVector, rightInput);

        const stepDelta = Math.min(delta, 1 / 30);
        kcc.refreshContacts(crashcat.world, character, crashcat.queryFilter);
        const grounded = kcc.isSupported(character);
        const planarVelocity = planarVelocityRef.current;
        const currentVelocityY = character.linearVelocity[1];

        const desired = wishVector.lengthSq() > 0
            ? wishVector.normalize().multiplyScalar(settings.maxSpeed)
            : wishVector.set(0, 0, 0);

        const accel = grounded ? settings.groundAccel : settings.airAccel;
        const maxDelta = accel * delta;
        planarVelocity.set(
            moveToward(planarVelocity.x, desired.x, maxDelta),
            0,
            moveToward(planarVelocity.z, desired.z, maxDelta),
        );

        if (grounded && planarVelocity.lengthSq() > 0 && desired.lengthSq() === 0) {
            planarVelocity.multiplyScalar(Math.max(0, 1 - settings.friction * delta * 0.1));
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

        kcc.update(crashcat.world, character, stepDelta, GRAVITY, updateSettingsRef.current, undefined, crashcat.queryFilter);

        const speed = planarVelocity.length();
        const moving = grounded && desired.lengthSq() > 0 && speed > settings.footstepMinSpeed;
        if (!moving) {
            footstepTimerRef.current = 0;
        } else {
            footstepTimerRef.current -= delta;
            if (footstepTimerRef.current <= 0) {
                gameEvents.emit(settings.footstepEventName, { speed });
                const alpha = Math.min(speed / settings.maxSpeed, 1);
                footstepTimerRef.current = settings.footstepMaxInterval - (settings.footstepMaxInterval - settings.footstepMinInterval) * alpha;
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

    return playMode ? <PointerLockControls makeDefault /> : null;
}
