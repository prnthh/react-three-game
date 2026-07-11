"use client";

import { useEffect } from "react";
import {
    FieldRenderer,
    useNode,
    type Component,
    type ComponentViewProps,
    type FieldDefinition,
} from "react-three-game/editor";
import { useCrashcat } from "react-three-game/plugins/crashcat";
import { cylinder, MotionType, rigidBody } from "crashcat";
import { Quaternion, Vector3 } from "three";

export type StagePoint = [number, number, number];

export type StageInteractionProperties = {
    action?: "dialogue" | "transition";
    page1?: string;
    page2?: string;
    sensorRadius?: number;
    sensorHalfHeight?: number;
    enterEventName?: string;
    exitEventName?: string;
};

const DEFAULT_ENTER_EVENT = "stage:interaction-enter";
const DEFAULT_EXIT_EVENT = "stage:interaction-exit";

const fields: FieldDefinition[] = [
    {
        name: "action",
        type: "select",
        label: "Action",
        options: [
            { value: "dialogue", label: "Dialogue" },
            { value: "transition", label: "Transition" },
        ],
    },
    { name: "page1", type: "string", label: "Dialogue Page 1" },
    { name: "page2", type: "string", label: "Dialogue Page 2" },
    { name: "sensorRadius", type: "number", label: "Sensor Radius", min: 0.05, step: 0.05 },
    { name: "sensorHalfHeight", type: "number", label: "Sensor Half Height", min: 0.05, step: 0.05 },
    { name: "enterEventName", type: "string", label: "Enter Event" },
    { name: "exitEventName", type: "string", label: "Exit Event" },
];

function StageInteractionView({ properties, children }: ComponentViewProps<StageInteractionProperties>) {
    const api = useCrashcat();
    const { nodeId, getObject } = useNode();

    useEffect(() => {
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
    }, [api, getObject, nodeId, properties.enterEventName, properties.exitEventName, properties.sensorHalfHeight, properties.sensorRadius]);

    return <>{children}</>;
}

const StageInteractionComponent: Component = {
    name: "StageInteraction",
    Editor: ({ component, onUpdate }) => (
        <FieldRenderer fields={fields} values={component.properties} onChange={onUpdate} />
    ),
    View: StageInteractionView,
    defaultProperties: {
        action: "dialogue",
        page1: "",
        page2: "",
        sensorRadius: 0.8,
        sensorHalfHeight: 1,
        enterEventName: DEFAULT_ENTER_EVENT,
        exitEventName: DEFAULT_EXIT_EVENT,
    },
};

export default StageInteractionComponent;
