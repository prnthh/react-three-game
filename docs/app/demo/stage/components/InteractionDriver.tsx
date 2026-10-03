"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameEvents, useGameObject, useNode, type Component, type ComponentViewProps, type ContactEventPayload } from "react-three-game/viewer";
import { Vector3 } from "three";
import type { DialogueAction, DialogueLibrary, StagePoint } from "../game";
import { dialoguePages, loadGameJson } from "../scene";
import { INTERACTION_ENTER_EVENT, INTERACTION_EXIT_EVENT, MOVE_EVENT, TRANSITION_EVENT } from "../stage";
import { usePlayer } from "./player";
import { useGameDriver } from "./GameDriver";
import { useDialogueDisplay } from "./OverlayHUD";
import AnimatedSceneTransition, { type TransitionAnimationRequest } from "./AnimatedSceneTransition";

export type InteractionProperties = {
    id?: string;
    dialogue?: string;
    action?: DialogueAction | "scene";
    activationNodeId?: string;
    targetScene?: string;
    spawn?: StagePoint;
    animation?: string;
};

/** One instance owns one entity's proximity, pending click, dialogue cursor, and animation. */
export function InteractionDriverView({ properties, children }: ComponentViewProps<InteractionProperties>) {
    const game = useGameDriver();
    const display = useDialogueDisplay();
    const events = useGameEvents();
    const object = useGameObject();
    const sensor = useGameObject(properties.activationNodeId || object.nodeId);
    const player = usePlayer();
    const { editMode } = useNode();
    const nearby = useRef(false);
    const pending = useRef(false);
    const locked = useRef(false);
    const [dialogue, setDialogue] = useState<{ pages: string[]; page: number } | null>(null);
    const [animation, setAnimation] = useState<TransitionAnimationRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const dialogueRequest = useRef<AbortController | null>(null);

    const cancel = useCallback(() => {
        pending.current = false;
        dialogueRequest.current?.abort();
        setDialogue(null);
        setError(null);
    }, []);

    const activate = useCallback(() => {
        if (!game || game.loading || locked.current) return;
        pending.current = false;
        events.emit(MOVE_EVENT, { destination: null });
        if (properties.action === "scene") {
            events.emit(TRANSITION_EVENT, true);
            setAnimation({ nodeId: object.nodeId, animation: properties.animation || "open" });
            return;
        }
        const action = properties.action;
        dialogueRequest.current?.abort();
        const controller = new AbortController();
        dialogueRequest.current = controller;
        void loadGameJson<DialogueLibrary>(game.rootFolder, properties.dialogue, controller.signal, game.basePath)
            .then(library => {
                const pages = dialoguePages(library, properties.id, action);
                if (!controller.signal.aborted) setDialogue(pages.length ? { pages, page: 0 } : null);
            }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    }, [game, events, object.nodeId, properties.action, properties.animation, properties.dialogue, properties.id]);

    useEffect(() => {
        if (!game || editMode) return;
        const stopClick = events.on("click", payload => {
            if (game.loading || locked.current) return;
            cancel();
            if (payload.nodeId !== object.id) return;
            if (nearby.current) { activate(); return; }
            pending.current = true;
            const position = object.transform?.getWorldPosition(new Vector3());
            if (position) events.emit(MOVE_EVENT, { destination: [position.x, 0, position.z] });
        });
        const stopEnter = events.on(INTERACTION_ENTER_EVENT, payload => {
            const contact = payload as ContactEventPayload;
            if (contact.sourceNodeId !== sensor.id || contact.targetNodeId !== player?.id) return;
            nearby.current = true;
            if (pending.current) activate();
        });
        const stopExit = events.on(INTERACTION_EXIT_EVENT, payload => {
            const contact = payload as ContactEventPayload;
            if (contact.sourceNodeId === sensor.id && contact.targetNodeId === player?.id) nearby.current = false;
        });
        const stopLock = events.on(TRANSITION_EVENT, value => {
            locked.current = Boolean(value);
            if (value) cancel();
        });
        return () => { stopClick(); stopEnter(); stopExit(); stopLock(); };
    }, [game, editMode, events, object, sensor.id, player?.id, activate, cancel]);

    useEffect(() => () => { dialogueRequest.current?.abort(); }, []);
    const next = useCallback(() => setDialogue(current => current && current.page + 1 < current.pages.length ? { ...current, page: current.page + 1 } : null), []);
    useEffect(() => {
        if (!display) return;
        if (dialogue) display.show({ owner: object.id, page: dialogue.page, text: dialogue.pages[dialogue.page], next });
        else if (error) display.show({ owner: object.id, page: -1, text: error, next: () => setError(null) });
        else display.hide(object.id);
        return () => display.hide(object.id);
    }, [display, object.id, dialogue, next, error]);

    const complete = useCallback(() => {
        setAnimation(null);
        if (game) void game.changeScene(properties.targetScene, properties.spawn).finally(() => events.emit(TRANSITION_EVENT, false));
    }, [game, properties.targetScene, properties.spawn, events]);

    return <>{children}{animation && <AnimatedSceneTransition request={animation} onComplete={complete} />}</>;
}

export const interactionProperties: Component<InteractionProperties>["properties"] = {
    id: { type: "string", default: "", label: "Dialogue entry ID" },
    dialogue: { type: "string", default: "dialogue.json", label: "Dialogue JSON" },
    action: { type: "select", default: "examine", options: (["talk", "examine", "interact", "scene"] as const).map(value => ({ value, label: value })) },
    activationNodeId: { type: "string", default: "" },
    targetScene: { type: "string", default: "" },
    spawn: { type: "vector3", default: [0, 0, 0] },
    animation: { type: "string", default: "open" },
};

const InteractionDriver: Component<InteractionProperties> = { name: "InteractionDriver", View: InteractionDriverView, properties: interactionProperties };
export default InteractionDriver;
