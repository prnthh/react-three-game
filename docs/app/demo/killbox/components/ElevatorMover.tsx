"use client";

import { useRef } from "react";
import { FieldRenderer, useNode, useScene, useGameEvent } from "react-three-game";
import type { Component, ComponentViewProps, ContactEventPayload, FieldDefinition } from "react-three-game";
import { useFrame } from "@react-three/fiber";

const DEFAULT_CONTACT_EVENT_NAME = "elevator:contact";
const DEFAULT_TRAVEL_DISTANCE = 4;
const DEFAULT_MOVE_SPEED = 1.6;
const DEFAULT_START_DELAY = 0;
const DEFAULT_RETURN_DELAY = 1;
const DEFAULT_RETURN_DURATION = 2.5;

type ElevatorPhase = "idle" | "starting" | "ascending" | "waiting" | "descending";

type ElevatorMoverProperties = {
    contactEventName?: string;
    triggerEntityId?: string;
    travelDistance?: number;
    moveSpeed?: number;
    startDelay?: number;
    returnDelay?: number;
    returnDuration?: number;
};

const elevatorMoverFields: FieldDefinition[] = [
    {
        name: "contactEventName",
        type: "string",
        label: "Contact Event",
    },
    { name: "triggerEntityId", type: "string", label: "Trigger Entity" },
    { name: "travelDistance", type: "number", label: "Travel Distance", step: 0.1 },
    { name: "moveSpeed", type: "number", label: "Move Speed", min: 0.01, step: 0.1 },
    { name: "startDelay", type: "number", label: "Start Delay", min: 0, step: 0.1 },
    { name: "returnDelay", type: "number", label: "Return Delay", min: 0, step: 0.1 },
    { name: "returnDuration", type: "number", label: "Return Duration", min: 0.01, step: 0.1 },
];

type ElevatorMoverEditorProps = {
    component: { properties: ElevatorMoverProperties };
    onUpdate: (values: ElevatorMoverProperties) => void;
};

function ElevatorMoverEditor({ component, onUpdate }: ElevatorMoverEditorProps) {
    return <FieldRenderer fields={elevatorMoverFields} values={component.properties} onChange={onUpdate} />;
}

function ElevatorMoverView({ properties, children }: ComponentViewProps<ElevatorMoverProperties>) {
    const { editMode, nodeId } = useNode();
    const scene = useScene();
    const phaseRef = useRef<ElevatorPhase>("idle");
    const waitTimerRef = useRef(0);
    const startHeightsRef = useRef<Record<string, number>>({});

    const contactEventName = properties.contactEventName?.trim() || DEFAULT_CONTACT_EVENT_NAME;
    const triggerEntityId = properties.triggerEntityId?.trim();
    const travelDistance = properties.travelDistance ?? DEFAULT_TRAVEL_DISTANCE;
    const moveSpeed = properties.moveSpeed ?? DEFAULT_MOVE_SPEED;
    const startDelay = properties.startDelay ?? DEFAULT_START_DELAY;
    const returnDelay = properties.returnDelay ?? DEFAULT_RETURN_DELAY;
    const returnDuration = properties.returnDuration ?? DEFAULT_RETURN_DURATION;

    useGameEvent(contactEventName, (payload) => {
        if (editMode || !payload) {
            return;
        }

        const contact = payload as ContactEventPayload;

        if (contact.sourceNodeId !== nodeId) {
            return;
        }

        if (triggerEntityId && contact.targetNodeId !== triggerEntityId && contact.targetEntityId !== triggerEntityId) {
            return;
        }

        if (phaseRef.current === "idle" || phaseRef.current === "descending") {
            phaseRef.current = startDelay > 0 ? "starting" : "ascending";
            waitTimerRef.current = startDelay;
        }
    }, [editMode, nodeId, startDelay, triggerEntityId]);

    useFrame((_, delta) => {
        if (editMode || phaseRef.current === "idle") {
            return;
        }

        const platformObject = scene.getObject(nodeId);
        if (!platformObject) {
            phaseRef.current = "idle";
            waitTimerRef.current = 0;
            return;
        }

        const currentY = platformObject.position.y;

        if (startHeightsRef.current[nodeId] === undefined) {
            startHeightsRef.current[nodeId] = currentY;
        }

        const startY = startHeightsRef.current[nodeId];
        const targetY = startY + travelDistance;
        const returnSpeed = travelDistance / Math.max(returnDuration, 0.01);

        if (phaseRef.current === "starting") {
            waitTimerRef.current -= delta;
            if (waitTimerRef.current <= 0) {
                phaseRef.current = "ascending";
                waitTimerRef.current = 0;
            }
            return;
        }

        if (phaseRef.current === "waiting") {
            waitTimerRef.current -= delta;
            if (waitTimerRef.current <= 0) {
                phaseRef.current = "descending";
            }
            return;
        }

        if (phaseRef.current === "ascending") {
            if (currentY >= targetY) {
                platformObject.position.y = targetY;
                platformObject.updateMatrixWorld(true);
                phaseRef.current = "waiting";
                waitTimerRef.current = returnDelay;
                return;
            }

            const nextY = Math.min(currentY + moveSpeed * delta, targetY);

            platformObject.position.y = nextY;
            platformObject.updateMatrixWorld(true);
            return;
        }

        const nextY = Math.max(currentY - returnSpeed * delta, startY);

        platformObject.position.y = nextY;
        platformObject.updateMatrixWorld(true);

        if (nextY <= startY) {
            phaseRef.current = "idle";
            waitTimerRef.current = 0;
        }
    });

    return <>{children}</>;
}

const ElevatorMover: Component = {
    name: "ElevatorMover",
    Editor: ElevatorMoverEditor,
    View: ElevatorMoverView,
    defaultProperties: {
        contactEventName: DEFAULT_CONTACT_EVENT_NAME,
        triggerEntityId: "",
        travelDistance: DEFAULT_TRAVEL_DISTANCE,
        moveSpeed: DEFAULT_MOVE_SPEED,
        startDelay: DEFAULT_START_DELAY,
        returnDelay: DEFAULT_RETURN_DELAY,
        returnDuration: DEFAULT_RETURN_DURATION,
    },
};

export default ElevatorMover;
