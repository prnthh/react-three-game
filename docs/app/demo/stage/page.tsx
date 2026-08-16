"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findComponent, gameEvents, PrefabEditorMode, registerComponent, usePrefab, useScene } from "react-three-game";
import type { ContactEventPayload, Prefab } from "react-three-game";
import { PrefabEditor } from "react-three-game/editor";
import { CrashcatPhysicsComponent, CrashcatRuntime } from "react-three-game/plugins/crashcat";
import AnimationMixer from "./components/AnimationMixer";
import SkinnedMesh, { type SkinnedMeshRef } from "./components/SkinnedMesh";
import { BASE_PATH, withBasePath } from "../../basePath";
import ActivationColliderComponent from "./ActivationColliderComponent";
import StageInteractionComponent, { type StageInteractionProperties, type StagePoint } from "./StageInteractionComponent";
import officeScene from "./scenes/office";
import outsideScene from "./scenes/outside";
import type { StageScene } from "./scenes/types";
import { OrthographicCamera, PerspectiveCamera, Quaternion, Vector3, type Group } from "three";
import type { AnimationAction } from "three";

registerComponent(CrashcatPhysicsComponent);
registerComponent(ActivationColliderComponent);
registerComponent(StageInteractionComponent);

const ONIMILIO_MODEL = withBasePath("/models/human/onimilio.glb");
const STAGE_SCENES = [officeScene, outsideScene];
const PLAYER_COLLIDER_ID = "stage-player-collider";
const PLAYER_COLLIDER_CENTER_Y = 0.85;
const INTERACTION_ENTER_EVENT = "stage:interaction-enter";
const INTERACTION_EXIT_EVENT = "stage:interaction-exit";
const WALK_SPEED = 1.55;
const ARRIVAL_DISTANCE = 0.08;
const CAMERA_DEAD_ZONE_X = 0.4;
const CAMERA_FOLLOW_SPEED = 8;
const UP = new Vector3(0, 1, 0);

type PendingInteraction = { nodeId: string; properties: StageInteractionProperties };
type Dialogue = { nodeId: string; pages: string[]; page: number; visible: number };

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

function StagePrefabLoader({ prefab }: { prefab: Prefab }) {
    const scene = usePrefab();

    useEffect(() => {
        scene.replace(prefab);
    }, [prefab, scene]);

    return null;
}

function PlayerCameraFollow() {
    const { mode } = useScene();
    const prefab = usePrefab();
    const camera = useThree((state) => state.camera);
    const worldPosition = useRef(new Vector3());
    const viewPosition = useRef(new Vector3());
    const projectedPosition = useRef(new Vector3());

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const player = prefab.getObject(PLAYER_COLLIDER_ID);
        if (!player) return;

        player.getWorldPosition(worldPosition.current);
        camera.updateMatrixWorld();
        projectedPosition.current.copy(worldPosition.current).project(camera);

        const projectedX = projectedPosition.current.x;
        if (Math.abs(projectedX) <= CAMERA_DEAD_ZONE_X) return;

        viewPosition.current.copy(worldPosition.current).applyMatrix4(camera.matrixWorldInverse);
        let halfWidth = 0;
        if (camera instanceof PerspectiveCamera) {
            halfWidth = -viewPosition.current.z
                * Math.tan(camera.fov * Math.PI / 360)
                * camera.aspect
                / camera.zoom;
        } else if (camera instanceof OrthographicCamera) {
            halfWidth = (camera.right - camera.left) / (2 * camera.zoom);
        }
        if (halfWidth <= 0) return;

        const boundary = Math.sign(projectedX) * CAMERA_DEAD_ZONE_X;
        const targetOffset = (projectedX - boundary) * halfWidth;
        camera.position.x += targetOffset * (1 - Math.exp(-CAMERA_FOLLOW_SPEED * delta));
        camera.updateMatrixWorld();
    }, -2);

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
    const [dialogue, setDialogue] = useState<Dialogue | null>(null);

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

        setActiveScene(targetScene);
        setPlayerSpawn(transition.spawn);
    }, [activeScene]);

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
            <PrefabEditor
                basePath={BASE_PATH}
                prefab={officeScene.prefab}
                mode={PrefabEditorMode.Play}
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
                    <StagePrefabLoader prefab={activeScene.prefab} />
                    <PlayerCameraFollow />
                    <PlayerCharacter
                        key={activeScene.id}
                        destination={playerDestination}
                        spawn={playerSpawn}
                    />

                    {ActiveSceneContent ? <ActiveSceneContent /> : null}
                </CrashcatRuntime>
            </PrefabEditor>
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
