"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { FieldRenderer, useNode, useScene, useGameEvent } from "react-three-game";
import type { Component, ComponentViewProps, ContactEventPayload, FieldDefinition } from "react-three-game";

const DEFAULT_SPEED = 1.2;
const COLLISION_EVENT_NAME = "orb:collision";

type OrbMoverProperties = {
    speed?: number;
    velocityX?: number;
    velocityZ?: number;
};

type OrbCollisionPayload = ContactEventPayload & {
    collisionNormal?: [number, number, number];
};

const orbMoverFields: FieldDefinition[] = [
    { name: "speed", type: "number", label: "Speed", min: 0, step: 0.1 },
    { name: "velocityX", type: "number", label: "Velocity X", step: 0.1 },
    { name: "velocityZ", type: "number", label: "Velocity Z", step: 0.1 },
];

function normalizeVelocity(x = 0, z = 0) {
    const magnitude = Math.hypot(x, z);
    return magnitude <= Number.EPSILON ? { x: 1, z: 0 } : { x: x / magnitude, z: z / magnitude };
}

function OrbMoverEditor({ component, onUpdate }: { component: { properties: OrbMoverProperties }; onUpdate: (newComp: { properties: OrbMoverProperties }) => void }) {
    return (
        <FieldRenderer
            fields={orbMoverFields}
            values={component.properties}
            onChange={(properties) => onUpdate({ ...component, properties: properties as OrbMoverProperties })}
        />
    );
}

function OrbMoverView({ properties, children }: ComponentViewProps<OrbMoverProperties>) {
    const { editMode, nodeId } = useNode();
    const scene = useScene();
    const velocityRef = useRef(normalizeVelocity(properties.velocityX ?? 1, properties.velocityZ ?? 0));

    const speed = properties.speed ?? DEFAULT_SPEED;

    useEffect(() => {
        velocityRef.current = normalizeVelocity(properties.velocityX ?? 1, properties.velocityZ ?? 0);
    }, [properties.velocityX, properties.velocityZ]);

    useGameEvent(COLLISION_EVENT_NAME, (payload) => {
        const normal = (payload as OrbCollisionPayload | null)?.collisionNormal;
        if (editMode || (payload as OrbCollisionPayload | null)?.sourceNodeId !== nodeId || !normal) return;

        const normalX = normal[0];
        const normalZ = normal[2];
        const normalMagnitude = Math.hypot(normalX, normalZ);
        if (normalMagnitude <= Number.EPSILON) return;

        const normalizedX = normalX / normalMagnitude;
        const normalizedZ = normalZ / normalMagnitude;
        const dot = velocityRef.current.x * normalizedX + velocityRef.current.z * normalizedZ;
        if (dot > 0) velocityRef.current = normalizeVelocity(
            velocityRef.current.x - 2 * dot * normalizedX,
            velocityRef.current.z - 2 * dot * normalizedZ,
        );
    }, [editMode, nodeId]);

    useFrame((_, delta) => {
        if (editMode) return;
        const orb = scene.getObject(nodeId);
        if (!orb) return;
        orb.position.x += velocityRef.current.x * speed * delta;
        orb.position.z += velocityRef.current.z * speed * delta;
        orb.updateMatrixWorld(true);
    });

    return <>{children}</>;
}

const OrbMover: Component = {
    name: "OrbMover",
    Editor: OrbMoverEditor,
    View: OrbMoverView,
    defaultProperties: {
        speed: DEFAULT_SPEED,
        velocityX: 1,
        velocityZ: 0,
    },
};

export default OrbMover;
