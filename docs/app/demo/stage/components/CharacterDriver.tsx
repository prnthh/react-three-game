"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { ANIMATED_MODEL_COMPONENT, useRegisterNodeComponent, useGameEvents, useGameObject, useNode, type Component, type ComponentViewProps } from "react-three-game/viewer";
import { Quaternion, Vector3 } from "three";
import type { StagePoint } from "../game";
import { MOVE_EVENT, TRANSITION_EVENT, type MoveRequest } from "../stage";
import { useGameDriver } from "./GameDriver";
import { InteractionDriverView, interactionProperties, type InteractionProperties } from "./InteractionDriver";

import { PLAYER } from "./player";

type CharacterProperties = InteractionProperties & {
    role?: "player" | "npc";
    modelNodeId?: string;
    walkSpeed?: number;
    centerY?: number;
    rotationY?: number;
};

const UP = new Vector3(0, 1, 0);

function PlayerController({ properties, children }: ComponentViewProps<CharacterProperties>) {
    const game = useGameDriver();
    const events = useGameEvents();
    const object = useGameObject();
    useRegisterNodeComponent(PLAYER, object);
    const initialized = useRef(false);
    const worldPosition = useRef(new Vector3());
    const model = useGameObject(properties.modelNodeId);
    const { editMode } = useNode();
    const destination = useRef<StagePoint | null>(null);
    const locked = useRef(false);
    const direction = useRef(new Vector3());
    const rotation = useRef(new Quaternion());
    useEffect(() => {
        if (!game || editMode) return;
        const stopMove = events.on(MOVE_EVENT, request => { if (!game.loading && !locked.current) destination.current = (request as MoveRequest).destination; });
        const stopLock = events.on(TRANSITION_EVENT, value => { locked.current = Boolean(value); if (value) destination.current = null; });
        return () => { stopMove(); stopLock(); };
    }, [game, events, editMode]);
    useFrame((_, delta) => {
        const player = object.transform;
        if (!game || editMode || !player) return;
        if (!initialized.current) {
            if (game.spawn) {
                player.position.set(game.spawn[0], game.spawn[1] + properties.centerY, game.spawn[2]);
                player.parent?.worldToLocal(player.position);
            }
            player.rotation.set(0, properties.rotationY, 0);
            initialized.current = true;
        }
        let walking = false;
        const target = destination.current;
        if (target && !game.loading && !locked.current) {
            player.getWorldPosition(worldPosition.current);
            direction.current.set(target[0] - worldPosition.current.x, 0, target[2] - worldPosition.current.z);
            const distance = direction.current.length();
            walking = distance > 0.08;
            if (walking) {
                direction.current.normalize();
                rotation.current.setFromAxisAngle(UP, Math.atan2(direction.current.x, direction.current.z));
                player.quaternion.slerp(rotation.current, 1 - Math.exp(-14 * delta));
                player.position.addScaledVector(direction.current, Math.min(distance, properties.walkSpeed * Math.min(delta, 0.1)));
            } else destination.current = null;
        }
        model.getComponent(ANIMATED_MODEL_COMPONENT)?.setAnimationState(walking ? "walk" : "idle");
        player.updateMatrixWorld(true);
    }, -3);
    return <>{children}</>;
}

const CharacterDriver: Component<CharacterProperties> = {
    name: "CharacterDriver",
    View: function CharacterDriverView(props) {
        return props.properties.role === "player" ? <PlayerController {...props} /> : <InteractionDriverView {...props} />;
    },
    properties: {
        ...interactionProperties,
        action: { ...interactionProperties.action, default: "talk" },
        role: { type: "select", default: "npc", options: [{ value: "player", label: "Player" }, { value: "npc", label: "NPC" }] },
        modelNodeId: { type: "string", default: "" },
        walkSpeed: { default: 1.55, min: 0 },
        centerY: { default: 0.85 },
        rotationY: { default: 0.25 },
    },
};
export default CharacterDriver;
