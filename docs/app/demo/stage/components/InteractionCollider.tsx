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

import { INTERACTION_ENTER_EVENT, INTERACTION_EXIT_EVENT } from "../stage";

export type InteractionColliderProperties = {
    sensorRadius?: number;
    sensorHalfHeight?: number;
    enterEventName?: string;
    exitEventName?: string;
};

const DEFAULT_ENTER_EVENT = INTERACTION_ENTER_EVENT;
const DEFAULT_EXIT_EVENT = INTERACTION_EXIT_EVENT;

function InteractionColliderView({ properties, children }: ComponentViewProps<InteractionColliderProperties>) {
    const api = useCrashcat();
    const { editMode } = useNode();
    const gameObject = useGameObject();
    const runtimeNodeId = gameObject.id;

    useEffect(() => {
        if (editMode) return;
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
    }, [api, editMode, gameObject, runtimeNodeId, properties.enterEventName, properties.exitEventName, properties.sensorHalfHeight, properties.sensorRadius]);

    return <>{children}</>;
}

const InteractionCollider: Component<InteractionColliderProperties> = {
    name: "InteractionCollider",
    category: 'physics',
    View: InteractionColliderView,
    properties: {
        sensorRadius: { default: 0.8, min: 0.05, step: 0.05 },
        sensorHalfHeight: { default: 1, min: 0.05, step: 0.05 },
        enterEventName: { type: "string", default: DEFAULT_ENTER_EVENT },
        exitEventName: { type: "string", default: DEFAULT_EXIT_EVENT },
    },
};

export default InteractionCollider;
