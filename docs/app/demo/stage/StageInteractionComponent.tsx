"use client";

import {
    FieldRenderer,
    type Component,
    type FieldDefinition,
} from "react-three-game/editor";

export type StagePoint = [number, number, number];

export type StageInteractionProperties = {
    action?: "dialogue" | "transition";
    approach?: StagePoint;
    page1?: string;
    page2?: string;
};

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
    { name: "approach", type: "vector3", label: "Approach" },
    { name: "page1", type: "string", label: "Dialogue Page 1" },
    { name: "page2", type: "string", label: "Dialogue Page 2" },
];

const StageInteractionComponent: Component = {
    name: "StageInteraction",
    Editor: ({ component, onUpdate }) => (
        <FieldRenderer fields={fields} values={component.properties} onChange={onUpdate} />
    ),
    defaultProperties: {
        action: "dialogue",
        approach: [0, 0, 0],
        page1: "",
        page2: "",
    },
};

export default StageInteractionComponent;
