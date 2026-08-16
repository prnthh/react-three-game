"use client";

import type { Component } from "react-three-game";
import {
    FieldRenderer,
    type ComponentEditorProps,
    type FieldDefinition,
} from "react-three-game/editor";
import ActivationColliderComponent, {
    type ActivationColliderProperties,
} from "./ActivationColliderComponent";
import StageInteractionComponent, {
    type StageInteractionProperties,
} from "./StageInteractionComponent";

const activationColliderFields = [
    { name: "targetNodeId", type: "node", label: "Target Node" },
    { name: "enterEventName", type: "string", label: "Enter Event" },
    { name: "exitEventName", type: "string", label: "Exit Event" },
    { name: "bubbleHeight", type: "number", label: "Bubble Height", step: 0.05 },
] satisfies FieldDefinition<ActivationColliderProperties>[];

function ActivationColliderEditor({
    properties,
    update,
}: ComponentEditorProps<ActivationColliderProperties>) {
    return <FieldRenderer fields={activationColliderFields} values={properties} onChange={update} />;
}

const stageInteractionFields = [
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
] satisfies FieldDefinition<StageInteractionProperties>[];

export const ActivationColliderEditorComponent: Component<ActivationColliderProperties> = {
    ...ActivationColliderComponent,
    Editor: ActivationColliderEditor,
};

export const StageInteractionEditorComponent: Component<StageInteractionProperties> = {
    ...StageInteractionComponent,
    Editor: ({ properties, update }) => (
        <FieldRenderer fields={stageInteractionFields} values={properties} onChange={update} />
    ),
};
