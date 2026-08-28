"use client";

import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
    gameEvents,
    useNode,
    type Component,
    type ComponentViewProps,
    type ContactEventPayload,
} from "react-three-game";

export type ActivationColliderProperties = {
    targetNodeId?: string;
    enterEventName?: string;
    exitEventName?: string;
    moods?: string[];
    bubbleHeight?: number;
};

const DEFAULT_ENTER_EVENT = "stage:activation-enter";
const DEFAULT_EXIT_EVENT = "stage:activation-exit";
const DEFAULT_TARGET_NODE = "stage-player-collider";
const DEFAULT_MOODS = ["🙂", "😄", "🤔", "😮", "😎", "🥳"];
const DEFAULT_BUBBLE_HEIGHT = 1.35;

function asContactPayload(payload: unknown): ContactEventPayload {
    return (payload ?? {}) as ContactEventPayload;
}

function ActivationColliderView({
    properties,
    children,
}: ComponentViewProps<ActivationColliderProperties>) {
    const { nodeId, editMode } = useNode();
    const [mood, setMood] = useState<string | null>(null);
    const activeTargetRef = useRef<string | null>(null);
    const targetNodeId = properties.targetNodeId?.trim() || DEFAULT_TARGET_NODE;
    const enterEventName = properties.enterEventName?.trim() || DEFAULT_ENTER_EVENT;
    const exitEventName = properties.exitEventName?.trim() || DEFAULT_EXIT_EVENT;
    const moods = useMemo(() => {
        const authoredMoods = properties.moods?.filter((entry) => entry.trim()) ?? [];
        return authoredMoods.length > 0 ? authoredMoods : DEFAULT_MOODS;
    }, [properties.moods]);

    useEffect(() => {
        if (editMode) {
            setMood(null);
            activeTargetRef.current = null;
            return;
        }

        const unsubscribeEnter = gameEvents.on(enterEventName, (payload) => {
            const event = asContactPayload(payload);
            if (event.sourceNodeId !== nodeId || event.targetNodeId !== targetNodeId) return;

            activeTargetRef.current = targetNodeId;
            setMood(moods[Math.floor(Math.random() * moods.length)] ?? DEFAULT_MOODS[0]);
        });
        const unsubscribeExit = gameEvents.on(exitEventName, (payload) => {
            const event = asContactPayload(payload);
            if (event.sourceNodeId !== nodeId || event.targetNodeId !== activeTargetRef.current) return;

            activeTargetRef.current = null;
            setMood(null);
        });

        return () => {
            unsubscribeEnter();
            unsubscribeExit();
        };
    }, [editMode, enterEventName, exitEventName, moods, nodeId, targetNodeId]);

    return (
        <>
            {children}
            {mood ? (
                <Html
                    center
                    position={[0, properties.bubbleHeight ?? DEFAULT_BUBBLE_HEIGHT, 0]}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                >
                    <div style={bubbleStyles.bubble}>
                        <span style={bubbleStyles.emoji}>{mood}</span>
                        <span style={bubbleStyles.tail} />
                    </div>
                </Html>
            ) : null}
        </>
    );
}

const bubbleStyles: Record<string, CSSProperties> = {
    bubble: {
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: 52,
        height: 40,
        borderRadius: 18,
        border: "1px solid rgba(31, 41, 55, 0.18)",
        background: "rgba(255, 255, 255, 0.94)",
        boxShadow: "0 12px 24px rgba(15, 23, 42, 0.2)",
    },
    emoji: {
        fontSize: 23,
        lineHeight: "1",
    },
    tail: {
        position: "absolute",
        bottom: -7,
        left: "50%",
        width: 14,
        height: 14,
        marginLeft: -7,
        borderRight: "1px solid rgba(31, 41, 55, 0.14)",
        borderBottom: "1px solid rgba(31, 41, 55, 0.14)",
        background: "rgba(255, 255, 255, 0.94)",
        transform: "rotate(45deg)",
    },
};

const ActivationColliderComponent: Component<ActivationColliderProperties> = {
    name: "ActivationCollider",
    View: ActivationColliderView,
    properties: {
        targetNodeId: { type: "string", default: DEFAULT_TARGET_NODE },
        enterEventName: { type: "string", default: DEFAULT_ENTER_EVENT },
        exitEventName: { type: "string", default: DEFAULT_EXIT_EVENT },
        moods: { type: "string[]", default: DEFAULT_MOODS },
        bubbleHeight: { default: DEFAULT_BUBBLE_HEIGHT },
    },
};

export default ActivationColliderComponent;
