"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useNode, useGameObject, useGameEvent } from "react-three-game/viewer";
import type { Component, ComponentViewProps, ContactEventPayload } from "react-three-game/viewer";

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

function normalizeVelocity(x = 0, z = 0) {
    const magnitude = Math.hypot(x, z);
    return magnitude <= Number.EPSILON ? { x: 1, z: 0 } : { x: x / magnitude, z: z / magnitude };
}

function OrbMoverView({ properties, children }: ComponentViewProps<OrbMoverProperties>) {
    const { editMode } = useNode();
    const object = useGameObject();
    const runtimeNodeId = object.id;
    const velocityRef = useRef(normalizeVelocity(properties.velocityX, properties.velocityZ));

    const speed = properties.speed;

    useEffect(() => {
        velocityRef.current = normalizeVelocity(properties.velocityX, properties.velocityZ);
    }, [properties.velocityX, properties.velocityZ]);

    useGameEvent(COLLISION_EVENT_NAME, (payload) => {
        const normal = (payload as OrbCollisionPayload | null)?.collisionNormal;
        if (editMode || (payload as OrbCollisionPayload | null)?.sourceEntityId !== runtimeNodeId || !normal) return;

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
    }, [editMode, runtimeNodeId]);

    useFrame((_, delta) => {
        if (editMode) return;
        const orb = object.transform;
        if (!orb) return;
        orb.position.x += velocityRef.current.x * speed * delta;
        orb.position.z += velocityRef.current.z * speed * delta;
        orb.updateMatrixWorld(true);
    }, -2);

    return <>{children}</>;
}

const OrbMover: Component<OrbMoverProperties> = {
    name: "OrbMover",
    View: OrbMoverView,
    properties: {
        speed: { default: DEFAULT_SPEED, min: 0, step: 0.1 },
        velocityX: { default: 1, step: 0.1 },
        velocityZ: { default: 0, step: 0.1 },
    },
};

export default OrbMover;
