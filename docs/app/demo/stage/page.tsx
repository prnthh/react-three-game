"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { findComponent, GameCanvas, GameEventsProvider, useGameEvents, PrefabRoot, type ContactEventPayload } from "react-three-game/viewer";
import { CrashcatRuntime } from "react-three-game/plugins/crashcat";
import { Vector3 } from "three";
import { BASE_PATH } from "../../basePath";
import "./registerComponents";
import DialogueBox from "./DialogueBox";
import PlayerCharacter from "./PlayerCharacter";
import AnimatedSceneTransition, { type TransitionAnimationRequest } from "./AnimatedSceneTransition";
import type { StageInteractionProperties } from "./StageInteractionComponent";
import { officeScene, STAGE_SCENES } from "./scenes";
import type { StageScene } from "./scenes";
import { PLAYER_NODE_ID, INTERACTION_ENTER_EVENT, INTERACTION_EXIT_EVENT, type StagePoint } from "./stage";

type PendingInteraction = { nodeId: string; activationNodeId: string; properties: StageInteractionProperties };
type Dialogue = { nodeId: string; pages: string[]; page: number };

function StageDemoContent() {
    const gameEvents = useGameEvents();
    const [activeScene, setActiveScene] = useState<StageScene>(officeScene);
    const [playerSpawn, setPlayerSpawn] = useState<StagePoint>(officeScene.playerStart);
    const [playerDestination, setPlayerDestination] = useState<StagePoint | null>(null);
    const pendingInteractionRef = useRef<PendingInteraction | null>(null);
    const activeInteractionSensorsRef = useRef(new Set<string>());
    const transitionInProgressRef = useRef(false);
    const [dialogue, setDialogue] = useState<Dialogue | null>(null);
    const [transitionAnimation, setTransitionAnimation] = useState<TransitionAnimationRequest | null>(null);

    const activateInteraction = useCallback((interaction: PendingInteraction) => {
        if (transitionInProgressRef.current) return;
        pendingInteractionRef.current = null;
        setPlayerDestination(null);

        if ((interaction.properties.action ?? "dialogue") === "dialogue") {
            const pages = (interaction.properties.pages ?? []).filter(page => page.trim());
            if (pages.length > 0) setDialogue({ nodeId: interaction.nodeId, pages, page: 0 });
            return;
        }

        const targetScene = STAGE_SCENES.find(scene => scene.id === interaction.properties.targetScene);
        if (!targetScene) return;

        transitionInProgressRef.current = true;
        setTransitionAnimation({
            nodeId: interaction.nodeId,
            animation: interaction.properties.animation?.trim() || "open",
            targetScene,
            spawn: interaction.properties.spawn ?? targetScene.playerStart,
        });
    }, []);

    const completeTransition = useCallback((request: TransitionAnimationRequest) => {
        pendingInteractionRef.current = null;
        activeInteractionSensorsRef.current.clear();
        setPlayerDestination(null);
        setDialogue(null);
        setActiveScene(request.targetScene);
        setPlayerSpawn(request.spawn);
        setTransitionAnimation(null);
        transitionInProgressRef.current = false;
    }, []);

    useEffect(() => {
        const stopEnter = gameEvents.on(INTERACTION_ENTER_EVENT, (payload) => {
            const contact = payload as ContactEventPayload;
            if (!contact.sourceNodeId || contact.targetNodeId !== PLAYER_NODE_ID) return;
            activeInteractionSensorsRef.current.add(contact.sourceNodeId);

            const interaction = pendingInteractionRef.current;
            if (interaction?.activationNodeId === contact.sourceNodeId) activateInteraction(interaction);
        });
        const stopExit = gameEvents.on(INTERACTION_EXIT_EVENT, (payload) => {
            const contact = payload as ContactEventPayload;
            if (contact.sourceNodeId && contact.targetNodeId === PLAYER_NODE_ID) {
                activeInteractionSensorsRef.current.delete(contact.sourceNodeId);
            }
        });
        return () => {
            stopEnter();
            stopExit();
            activeInteractionSensorsRef.current.clear();
        };
    }, [gameEvents, activateInteraction, activeScene.id]);

    const advanceDialogue = useCallback(() => {
        setDialogue((current) => {
            if (!current) return null;
            if (current.page + 1 < current.pages.length) return { ...current, page: current.page + 1 };
            return null;
        });
    }, []);

    return (
        <main className="relative flex h-screen w-screen flex-col items-center justify-between overflow-hidden bg-white dark:bg-black sm:items-start">
            <GameCanvas>
                <PrefabRoot
                    key={activeScene.id}
                    basePath={BASE_PATH}
                    data={activeScene.prefab}
                    onPointerEvent={(eventType, event, node) => {
                        if (eventType !== "click" || transitionInProgressRef.current) return;

                        const interaction = findComponent(node, "StageInteraction")?.properties as StageInteractionProperties | undefined;
                        if (interaction) {
                            const objectPosition = event.object.getWorldPosition(new Vector3());
                            const activationNodeId = interaction.activationNodeId?.trim() || node.id;
                            const pendingInteraction = { nodeId: node.id, activationNodeId, properties: interaction };
                            pendingInteractionRef.current = pendingInteraction;
                            setDialogue(null);
                            if (activeInteractionSensorsRef.current.has(activationNodeId)) {
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
                        <PlayerCharacter
                            destination={playerDestination}
                            spawn={playerSpawn}
                        />

                    </CrashcatRuntime>
                </PrefabRoot>
            </GameCanvas>
            {dialogue ? (
                <DialogueBox key={`${dialogue.nodeId}:${dialogue.page}`} text={dialogue.pages[dialogue.page]} onNext={advanceDialogue} />
            ) : null}
        </main>
    );
}

export default function StageDemo() {
    return <GameEventsProvider><StageDemoContent /></GameEventsProvider>;
}
