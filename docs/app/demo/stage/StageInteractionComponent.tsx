"use client";

import { useEffect } from "react";
import {
    useGameObject,
    useNode,
    type Component,
    type ComponentViewProps,
} from "react-three-game/viewer";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { cylinder, MotionType, rigidBody } from "crashcat";
import { Quaternion, Vector3 } from "three";

import { INTERACTION_ENTER_EVENT, INTERACTION_EXIT_EVENT, type StagePoint } from "./stage";

export type StageInteractionProperties = {
    action?: "dialogue" | "transition";
    animation?: string;
    activationNodeId?: string;
    pages?: string[];
    targetScene?: string;
    spawn?: StagePoint;
    sensorRadius?: number;
    sensorHalfHeight?: number;
    enterEventName?: string;
    exitEventName?: string;
};

const DEFAULT_ENTER_EVENT = INTERACTION_ENTER_EVENT;
const DEFAULT_EXIT_EVENT = INTERACTION_EXIT_EVENT;

function StageInteractionView({ properties, children }: ComponentViewProps<StageInteractionProperties>) {
    const api = useCrashcat();
    const { nodeId } = useNode();
    const gameObject = useGameObject();
    const runtimeNodeId = gameObject.id;

    useEffect(() => {
        const activationNodeId = properties.activationNodeId?.trim();
        if (activationNodeId && activationNodeId !== nodeId) return;
        const object = gameObject.transform;
        if (!api || !object) return;

        object.updateWorldMatrix(true, false);
        const position = object.getWorldPosition(new Vector3());
        const quaternion = object.getWorldQuaternion(new Quaternion());
        const body = rigidBody.create(api.world, {
            shape: cylinder.create({
                radius: Math.max(properties.sensorRadius ?? 0.8, 0.05),
                halfHeight: Math.max(properties.sensorHalfHeight ?? 1, 0.05),
            }),
            motionType: MotionType.STATIC,
            objectLayer: api.staticObjectLayer,
            position: [position.x, position.y, position.z],
            quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
            sensor: true,
            userData: { nodeId: runtimeNodeId },
        });

        api.register(runtimeNodeId, body, {
            motionType: MotionType.STATIC,
            sensor: true,
            events: {
                sensorEnter: properties.enterEventName?.trim() || DEFAULT_ENTER_EVENT,
                sensorExit: properties.exitEventName?.trim() || DEFAULT_EXIT_EVENT,
            },
        });

        return () => api.unregister(runtimeNodeId);
    }, [api, gameObject, nodeId, runtimeNodeId, properties.activationNodeId, properties.enterEventName, properties.exitEventName, properties.sensorHalfHeight, properties.sensorRadius]);

    return <>{children}</>;
}

const StageInteractionComponent: Component<StageInteractionProperties> = {
    name: "StageInteraction",
    View: StageInteractionView,
    properties: {
        action: {
            type: "select",
            default: "dialogue",
            options: [
                { value: "dialogue", label: "Dialogue" },
                { value: "transition", label: "Transition" },
            ],
        },
        pages: { type: "string[]", default: [], label: "Dialogue Pages" },
        targetScene: { type: "string", default: "" },
        spawn: { type: "vector3", default: [0, 0, 0] },
        animation: { type: "string", default: "" },
        activationNodeId: { type: "string", default: "" },
        sensorRadius: { default: 0.8, min: 0.05, step: 0.05 },
        sensorHalfHeight: { default: 1, min: 0.05, step: 0.05 },
        enterEventName: { type: "string", default: DEFAULT_ENTER_EVENT },
        exitEventName: { type: "string", default: DEFAULT_EXIT_EVENT },
    },
};

export default StageInteractionComponent;
