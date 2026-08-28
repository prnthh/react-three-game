"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CAMERA_POSITION_ROUTE_HANDLE, findComponent, GameCanvas, gameEvents, PrefabEditorMode, PrefabRoot, registerComponent, usePrefab, useScene } from "react-three-game";
import type { CameraPositionRoute, ContactEventPayload } from "react-three-game";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import AnimationMixer from "./components/AnimationMixer";
import SkinnedMesh, { type SkinnedMeshRef } from "./components/SkinnedMesh";
import { BASE_PATH, withBasePath } from "../../basePath";
import ActivationColliderComponent from "./ActivationColliderComponent";
import StageInteractionComponent, { type StageInteractionProperties, type StagePoint } from "./StageInteractionComponent";
import { officeScene, STAGE_SCENES } from "./scenes";
import type { StageScene } from "./scenes/types";
import { AnimationMixer as ThreeAnimationMixer, LoopOnce, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3, type AnimationClip, type Group, type Object3D } from "three";
import type { AnimationAction } from "three";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ActivationColliderComponent);
registerComponent(StageInteractionComponent);

const ONIMILIO_MODEL = withBasePath("/models/human/onimilio.glb");
const PLAYER_COLLIDER_ID = "stage-player-collider";
const PLAYER_COLLIDER_CENTER_Y = 0.85;
const INTERACTION_ENTER_EVENT = "stage:interaction-enter";
const INTERACTION_EXIT_EVENT = "stage:interaction-exit";
const WALK_SPEED = 1.55;
const ARRIVAL_DISTANCE = 0.08;
const CAMERA_DEAD_ZONE = 0.4;
const CAMERA_FOLLOW_SPEED = 8;
const UP = new Vector3(0, 1, 0);
const CAMERA_RIGHT = new Vector3(1, 0, 0);

type PendingInteraction = { nodeId: string; properties: StageInteractionProperties };
type Dialogue = { nodeId: string; pages: string[]; page: number; visible: number };
type TransitionAnimationRequest = {
    nodeId: string;
    animation: string;
    targetScene: StageScene;
    spawn: StagePoint;
};

function interactionPages(properties: StageInteractionProperties) {
    return [properties.page1, properties.page2].filter((page): page is string => Boolean(page?.trim()));
}

function findAnimationName(actionNames: string[], preferred: "idle" | "walk") {
    const normalized = actionNames.map((name) => ({ name, key: name.toLowerCase() }));

    if (preferred === "idle") {
        return normalized.find(({ key }) => key === "idle" || key.includes("idle"))?.name
            ?? actionNames[0];
    }

    return normalized.find(({ key }) => key === "walk" || key.includes("walk"))?.name
        ?? normalized.find(({ key }) => key.includes("run"))?.name
        ?? normalized.find(({ key }) => !key.includes("idle"))?.name
        ?? actionNames[0];
}

function PlayerCameraFollow() {
    const { mode } = useScene();
    const prefab = usePrefab();
    const camera = useThree((state) => state.camera);
    const worldPosition = useRef(new Vector3());
    const viewPosition = useRef(new Vector3());
    const projectedPosition = useRef(new Vector3());
    const cameraWorldPosition = useRef(new Vector3());
    const routedWorldPosition = useRef(new Vector3());
    const cameraRight = useRef(new Vector3());
    const cameraUp = useRef(new Vector3());
    const cameraWorldQuaternion = useRef(new Quaternion());

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const player = prefab.getObject(PLAYER_COLLIDER_ID);
        if (!player) return;
        const positionRoute = prefab.getHandle<CameraPositionRoute>("stage-camera", CAMERA_POSITION_ROUTE_HANDLE);
        if (!positionRoute) return;

        player.getWorldPosition(worldPosition.current);
        camera.updateMatrixWorld();
        projectedPosition.current.copy(worldPosition.current).project(camera);

        const projectedX = projectedPosition.current.x;
        const projectedY = projectedPosition.current.y;
        if (Math.abs(projectedX) <= CAMERA_DEAD_ZONE && Math.abs(projectedY) <= CAMERA_DEAD_ZONE) return;

        viewPosition.current.copy(worldPosition.current).applyMatrix4(camera.matrixWorldInverse);
        let halfWidth = 0;
        let halfHeight = 0;
        if (camera instanceof PerspectiveCamera) {
            halfHeight = -viewPosition.current.z * Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
            halfWidth = halfHeight * camera.aspect;
        } else if (camera instanceof OrthographicCamera) {
            halfWidth = (camera.right - camera.left) / (2 * camera.zoom);
            halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom);
        }
        if (halfWidth <= 0 || halfHeight <= 0) return;

        const offsetX = Math.abs(projectedX) > CAMERA_DEAD_ZONE
            ? (projectedX - Math.sign(projectedX) * CAMERA_DEAD_ZONE) * halfWidth
            : 0;
        const offsetY = Math.abs(projectedY) > CAMERA_DEAD_ZONE
            ? (projectedY - Math.sign(projectedY) * CAMERA_DEAD_ZONE) * halfHeight
            : 0;

        camera.getWorldPosition(cameraWorldPosition.current);
        camera.getWorldQuaternion(cameraWorldQuaternion.current);
        cameraRight.current.copy(CAMERA_RIGHT).applyQuaternion(cameraWorldQuaternion.current);
        cameraUp.current.copy(UP).applyQuaternion(cameraWorldQuaternion.current);
        routedWorldPosition.current
            .copy(cameraWorldPosition.current)
            .addScaledVector(cameraRight.current, offsetX)
            .addScaledVector(cameraUp.current, offsetY);
        positionRoute.setWorldPosition(
            routedWorldPosition.current,
            1 - Math.exp(-CAMERA_FOLLOW_SPEED * delta),
        );
    }, -2);

    return null;
}

function findAnimation(object: Object3D, name: string) {
    let result: { root: Object3D; clip: AnimationClip } | null = null;
    object.traverse((candidate) => {
        if (result) return;
        const clip = candidate.animations.find((animation) => animation.name === name);
        if (clip) result = { root: candidate, clip };
    });
    return result as { root: Object3D; clip: AnimationClip } | null;
}

function AnimatedSceneTransition({
    request,
    onComplete,
}: {
    request: TransitionAnimationRequest | null;
    onComplete: (request: TransitionAnimationRequest) => void;
}) {
    const prefab = usePrefab();
    const mixerRef = useRef<ThreeAnimationMixer | null>(null);
    const remainingRef = useRef(0);
    const activeRequestRef = useRef<TransitionAnimationRequest | null>(null);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    useEffect(() => {
        mixerRef.current?.stopAllAction();
        mixerRef.current = null;
        activeRequestRef.current = null;
        remainingRef.current = 0;
        if (!request) return;

        const door = prefab.getObject(request.nodeId);
        const animation = door ? findAnimation(door, request.animation) : null;
        if (!animation) {
            console.warn(`Animation "${request.animation}" was not found on transition node "${request.nodeId}".`);
            const timer = window.setTimeout(() => onCompleteRef.current(request), 0);
            return () => window.clearTimeout(timer);
        }

        const mixer = new ThreeAnimationMixer(animation.root);
        const action = mixer.clipAction(animation.clip, animation.root);
        action.reset().setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        mixerRef.current = mixer;
        activeRequestRef.current = request;
        remainingRef.current = animation.clip.duration;

        return () => {
            mixer.stopAllAction();
            mixer.uncacheRoot(animation.root);
        };
    }, [prefab, request]);

    useFrame((_, delta) => {
        const mixer = mixerRef.current;
        const activeRequest = activeRequestRef.current;
        if (!mixer || !activeRequest) return;

        mixer.update(delta);
        remainingRef.current -= delta;
        if (remainingRef.current > 0) return;

        mixerRef.current = null;
        activeRequestRef.current = null;
        onCompleteRef.current(activeRequest);
    }, -1);

    return null;
}

function PlayerCharacter({
    destination,
    spawn,
}: {
    destination: StagePoint | null;
    spawn: StagePoint;
}) {
    const scene = usePrefab();
    const playerRef = useRef<Group>(null);
    const skinnedMeshRef = useRef<SkinnedMeshRef>(null);
    const targetRef = useRef<Vector3 | null>(null);
    const scratchDirection = useRef(new Vector3());
    const scratchPosition = useRef(new Vector3());
    const targetQuaternion = useRef(new Quaternion());
    const [actionNames, setActionNames] = useState<string[]>([]);
    const [isWalking, setIsWalking] = useState(false);

    const animation = useMemo(() => {
        if (actionNames.length === 0) return undefined;
        return findAnimationName(actionNames, isWalking ? "walk" : "idle");
    }, [actionNames, isWalking]);

    const syncPlayerCollider = useCallback((player: Group) => {
        const collider = scene.getObject(PLAYER_COLLIDER_ID);
        if (!collider) return;

        player.getWorldPosition(scratchPosition.current);
        collider.position.set(scratchPosition.current.x, PLAYER_COLLIDER_CENTER_Y, scratchPosition.current.z);
        collider.quaternion.copy(player.quaternion);
        collider.updateMatrixWorld(true);
    }, [scene]);

    useEffect(() => {
        const player = playerRef.current;
        if (!player) return;

        player.position.set(spawn[0], spawn[1], spawn[2]);
        player.rotation.set(0, 0.25, 0);
        targetRef.current = null;
        setIsWalking(false);
        syncPlayerCollider(player);
    }, [spawn, syncPlayerCollider]);

    useEffect(() => {
        if (!destination) {
            targetRef.current = null;
            setIsWalking(false);
            return;
        }

        targetRef.current = new Vector3(destination[0], spawn[1], destination[2]);
        setIsWalking(true);
    }, [destination, spawn]);

    const handleActions = useCallback((actions: Record<string, AnimationAction>) => {
        const nextNames = Object.keys(actions);
        setActionNames((currentNames) => {
            if (currentNames.length === nextNames.length && currentNames.every((name, index) => name === nextNames[index])) {
                return currentNames;
            }

            return nextNames;
        });
    }, []);

    useFrame((_, delta) => {
        const player = playerRef.current;
        if (!player) return;

        const target = targetRef.current;
        if (!target) {
            syncPlayerCollider(player);
            return;
        }

        const position = player.getWorldPosition(scratchPosition.current);
        const direction = scratchDirection.current.subVectors(target, position);
        direction.y = 0;

        const remaining = direction.length();
        if (remaining <= ARRIVAL_DISTANCE) {
            player.position.set(target.x, spawn[1], target.z);
            targetRef.current = null;
            setIsWalking(false);
            syncPlayerCollider(player);
            return;
        }

        direction.normalize();
        const yaw = Math.atan2(direction.x, direction.z);
        targetQuaternion.current.setFromAxisAngle(UP, yaw);
        player.quaternion.slerp(targetQuaternion.current, 1 - Math.exp(-14 * delta));

        const step = Math.min(remaining, WALK_SPEED * delta);
        player.position.x += direction.x * step;
        player.position.z += direction.z * step;
        syncPlayerCollider(player);
    }, -3);

    return (
        <group ref={playerRef} position={spawn} rotation={[0, 0.25, 0]} scale={[0.92, 0.92, 0.92]}>
            <SkinnedMesh ref={skinnedMeshRef} model={ONIMILIO_MODEL} />
            <AnimationMixer
                skinnedMeshRef={skinnedMeshRef}
                animation={animation}
                onActions={handleActions}
            />
        </group>
    );
}

export default function StageDemo() {
    const [activeScene, setActiveScene] = useState<StageScene>(officeScene);
    const [playerSpawn, setPlayerSpawn] = useState<StagePoint>(officeScene.playerStart);
    const [playerDestination, setPlayerDestination] = useState<StagePoint | null>(null);
    const pendingInteractionRef = useRef<PendingInteraction | null>(null);
    const activeInteractionSensorsRef = useRef(new Set<string>());
    const transitionInProgressRef = useRef(false);
    const [dialogue, setDialogue] = useState<Dialogue | null>(null);
    const [transitionAnimation, setTransitionAnimation] = useState<TransitionAnimationRequest | null>(null);

    const dialogueText = dialogue?.pages[dialogue.page] ?? "";
    const debugStateRef = useRef({ activeScene, playerSpawn, playerDestination, dialogue, dialogueText });
    debugStateRef.current = { activeScene, playerSpawn, playerDestination, dialogue, dialogueText };

    useEffect(() => {
        if (!dialogue || dialogue.visible >= dialogueText.length) return;

        const timer = window.setInterval(() => {
            setDialogue((current) => current && current.nodeId === dialogue.nodeId && current.page === dialogue.page
                ? { ...current, visible: Math.min(dialogueText.length, current.visible + 1) }
                : current);
        }, 24);
        return () => window.clearInterval(timer);
    }, [dialogue, dialogueText]);

    useEffect(() => {
        const debugWindow = window as Window & { render_game_to_text?: () => string };
        debugWindow.render_game_to_text = () => {
            const state = debugStateRef.current;
            return JSON.stringify({
                scene: state.activeScene.id,
                playerSpawn: state.playerSpawn,
                destination: state.playerDestination,
                dialogue: state.dialogue ? {
                    object: state.dialogue.nodeId,
                    page: state.dialogue.page + 1,
                    pages: state.dialogue.pages.length,
                    text: state.dialogueText.slice(0, state.dialogue.visible),
                    typing: state.dialogue.visible < state.dialogueText.length,
                } : null,
                coordinates: "x right, y up, z toward camera",
            });
        };
        return () => {
            delete debugWindow.render_game_to_text;
        };
    }, []);

    const activateInteraction = useCallback((interaction: PendingInteraction) => {
        if (transitionInProgressRef.current) return;
        pendingInteractionRef.current = null;
        setPlayerDestination(null);

        if (interaction.properties.action === "dialogue") {
            const pages = interactionPages(interaction.properties);
            if (pages.length > 0) setDialogue({ nodeId: interaction.nodeId, pages, page: 0, visible: 0 });
            return;
        }

        const transition = activeScene.transition(interaction.nodeId);
        if (!transition) return;

        const targetScene = STAGE_SCENES.find((scene) => scene.prefab === transition.prefab);
        if (!targetScene) return;

        transitionInProgressRef.current = true;
        setTransitionAnimation({
            nodeId: interaction.nodeId,
            animation: interaction.properties.animation?.trim() || "open",
            targetScene,
            spawn: transition.spawn,
        });
    }, [activeScene]);

    const completeTransition = useCallback((request: TransitionAnimationRequest) => {
        setActiveScene(request.targetScene);
        setPlayerSpawn(request.spawn);
        setTransitionAnimation(null);
        transitionInProgressRef.current = false;
    }, []);

    useEffect(() => {
        const stopEnter = gameEvents.on(INTERACTION_ENTER_EVENT, (payload) => {
            const contact = payload as ContactEventPayload;
            if (!contact.sourceNodeId || contact.targetNodeId !== PLAYER_COLLIDER_ID) return;
            activeInteractionSensorsRef.current.add(contact.sourceNodeId);

            const interaction = pendingInteractionRef.current;
            if (interaction?.nodeId === contact.sourceNodeId) activateInteraction(interaction);
        });
        const stopExit = gameEvents.on(INTERACTION_EXIT_EVENT, (payload) => {
            const contact = payload as ContactEventPayload;
            if (contact.sourceNodeId && contact.targetNodeId === PLAYER_COLLIDER_ID) {
                activeInteractionSensorsRef.current.delete(contact.sourceNodeId);
            }
        });
        return () => {
            stopEnter();
            stopExit();
            activeInteractionSensorsRef.current.clear();
        };
    }, [activateInteraction]);

    const advanceDialogue = useCallback(() => {
        setDialogue((current) => {
            if (!current) return null;
            const text = current.pages[current.page] ?? "";
            if (current.visible < text.length) return { ...current, visible: text.length };
            if (current.page + 1 < current.pages.length) return { ...current, page: current.page + 1, visible: 0 };
            return null;
        });
    }, []);

    const ActiveSceneContent = activeScene.Content;

    return (
        <main className="relative flex h-screen w-screen flex-col items-center justify-between overflow-hidden bg-white dark:bg-black sm:items-start">
            <GameCanvas>
                <PrefabRoot
                    basePath={BASE_PATH}
                    data={activeScene.prefab}
                    onPointerEvent={(eventType, event, node) => {
                        if (eventType !== "click") return;

                        const interaction = findComponent(node, "StageInteraction")?.properties as StageInteractionProperties | undefined;
                        if (interaction) {
                            const objectPosition = event.object.getWorldPosition(new Vector3());
                            const pendingInteraction = { nodeId: node.id, properties: interaction };
                            pendingInteractionRef.current = pendingInteraction;
                            setDialogue(null);
                            if (activeInteractionSensorsRef.current.has(node.id)) {
                                activateInteraction(pendingInteraction);
                                return;
                            }
                            setPlayerDestination([objectPosition.x, 0, objectPosition.z]);
                            return;
                        }

                        if (node.id === "stage-floor") {
                            pendingInteractionRef.current = null;
                            setDialogue(null);
                            setPlayerDestination([event.point.x, event.point.y, event.point.z]);
                        }
                    }}
                >
                    <CrashcatRuntime>
                        <AnimatedSceneTransition request={transitionAnimation} onComplete={completeTransition} />
                        <PlayerCameraFollow />
                        <PlayerCharacter
                            key={activeScene.id}
                            destination={playerDestination}
                            spawn={playerSpawn}
                        />

                        {ActiveSceneContent ? <ActiveSceneContent /> : null}
                    </CrashcatRuntime>
                </PrefabRoot>
            </GameCanvas>
            {dialogue ? (
                <button
                    type="button"
                    onClick={advanceDialogue}
                    className="absolute bottom-8 left-1/2 z-20 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 cursor-pointer rounded-2xl border-4 border-black bg-[#fff7cf] px-6 py-5 text-left font-mono text-base leading-relaxed text-black shadow-[8px_8px_0_#1b1b1b] sm:text-lg"
                    aria-label="Continue dialogue"
                >
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-[#8b3d2f]">Field notes</span>
                    {dialogueText.slice(0, dialogue.visible)}
                    <span className="ml-1 animate-pulse">{dialogue.visible < dialogueText.length ? "▌" : "▼"}</span>
                </button>
            ) : null}
        </main>
    );
}
