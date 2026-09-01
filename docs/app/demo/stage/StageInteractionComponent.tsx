"use client";

import { useEffect } from "react";
import {
    useNode,
    type Component,
    type ComponentViewProps,
} from "react-three-game";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { cylinder, MotionType, rigidBody } from "crashcat";
import { Quaternion, Vector3 } from "three";

export type StagePoint = [number, number, number];

export type StageInteractionProperties = {
    action?: "dialogue" | "transition";
    animation?: string;
    activationNodeId?: string;
    page1?: string;
    page2?: string;
    sensorRadius?: number;
    sensorHalfHeight?: number;
    enterEventName?: string;
    exitEventName?: string;
};

const DEFAULT_ENTER_EVENT = "stage:interaction-enter";
const DEFAULT_EXIT_EVENT = "stage:interaction-exit";

function StageInteractionView({ properties, children }: ComponentViewProps<StageInteractionProperties>) {
    const api = useCrashcat();
    const { nodeId, getObject } = useNode();

    useEffect(() => {
        const activationNodeId = properties.activationNodeId?.trim();
        if (activationNodeId && activationNodeId !== nodeId) return;
        const object = getObject();
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
            userData: { nodeId },
        });

        api.register(nodeId, body, {
            motionType: MotionType.STATIC,
            sensor: true,
            events: {
                sensorEnter: properties.enterEventName?.trim() || DEFAULT_ENTER_EVENT,
                sensorExit: properties.exitEventName?.trim() || DEFAULT_EXIT_EVENT,
            },
        });

        return () => api.unregister(nodeId);
    }, [api, getObject, nodeId, properties.activationNodeId, properties.enterEventName, properties.exitEventName, properties.sensorHalfHeight, properties.sensorRadius]);

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
        page1: { type: "string", default: "" },
        page2: { type: "string", default: "" },
        animation: { type: "string", default: "" },
        activationNodeId: { type: "string", default: "" },
        sensorRadius: { default: 0.8 },
        sensorHalfHeight: { default: 1 },
        enterEventName: { type: "string", default: DEFAULT_ENTER_EVENT },
        exitEventName: { type: "string", default: DEFAULT_EXIT_EVENT },
    },
};

export default StageInteractionComponent;
