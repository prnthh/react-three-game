import { useFrame } from "@react-three/fiber";

import { useEffect, useRef } from "react";

import { useGameEvents, useGameObject, useNode, type Component, type ComponentViewProps, type ContactEventPayload } from "react-three-game/viewer";

import type { Material, Mesh, Object3D } from "three";

export type AdvancingTargetProperties = {
    speed?: number;
    resetZ?: number;
    breachZ?: number;
    idleColor?: string;
    hitColor?: string;
    hitEventName?: string;
    breachEventName?: string;
};

const DEFAULT_SPEED = 2.4;

const DEFAULT_RESET_Z = -34;

const DEFAULT_BREACH_Z = 4.4;

const DEFAULT_IDLE_COLOR = "#facc15";

const DEFAULT_HIT_COLOR = "#f43f5e";

const DEFAULT_HIT_EVENT = "target:hit";

const DEFAULT_BREACH_EVENT = "target:breach";

function setObjectColor(object: Object3D, color: string) {
    object.traverse((child) => {
        if (child.userData.preserveTargetColor === true) return;

        const material = (child as Mesh).material;
        if (!material) return;

        const materials = Array.isArray(material) ? material : [material];
        materials.forEach((entry: Material & { color?: { set: (value: string) => void } }) => {
            entry.color?.set(color);
        });
    });
}

function AdvancingTargetView({
    properties,
    children,
}: ComponentViewProps<AdvancingTargetProperties>) {
    const gameEvents = useGameEvents();
    const { editMode } = useNode();
    const target = useGameObject();
    const elapsedRef = useRef(0);
    const hitFlashRef = useRef(0);
    const resetCountRef = useRef(0);

    useEffect(() => {
        const eventName = properties.hitEventName?.trim() || DEFAULT_HIT_EVENT;
        const stopHit = gameEvents.on(eventName, (payload: unknown) => {
            const contact = payload as ContactEventPayload;
            if (contact.sourceNodeId !== target.id || contact.targetObject?.name !== "machinegun-round") return;

            const object = target.transform;
            if (!object) return;

            const resetZ = properties.resetZ ?? DEFAULT_RESET_Z;
            const spread = 2.5 + (resetCountRef.current % 3) * 1.35;
            object.position.z = resetZ - spread;
            hitFlashRef.current = 0.2;
            resetCountRef.current += 1;
            setObjectColor(object, properties.hitColor ?? DEFAULT_HIT_COLOR);
        });

        return stopHit;
    }, [gameEvents, target, properties.hitColor, properties.hitEventName, properties.resetZ]);

    useFrame((_, delta) => {
        const object = target.transform;
        if (!object || editMode) return;

        if (elapsedRef.current === 0) {
            setObjectColor(object, properties.idleColor ?? DEFAULT_IDLE_COLOR);
        }

        elapsedRef.current += delta;

        const speed = properties.speed ?? DEFAULT_SPEED;
        const breachZ = properties.breachZ ?? DEFAULT_BREACH_Z;
        const resetZ = properties.resetZ ?? DEFAULT_RESET_Z;
        object.position.z += speed * delta;

        if (object.position.z > breachZ) {
            object.position.z = resetZ - (resetCountRef.current % 4) * 1.7;
            resetCountRef.current += 1;
            const eventName = properties.breachEventName?.trim() || DEFAULT_BREACH_EVENT;
            gameEvents.emit(eventName, {
                sourceEntityId: target.id,
                sourceNodeId: target.id,
            });
        }

        if (hitFlashRef.current > 0) {
            hitFlashRef.current = Math.max(0, hitFlashRef.current - delta);
            if (hitFlashRef.current === 0) {
                setObjectColor(object, properties.idleColor ?? DEFAULT_IDLE_COLOR);
            }
        }
    }, -4);

    return <>{children}</>;
}

const AdvancingTargetComponent: Component<AdvancingTargetProperties> = {
    name: "AdvancingTarget",
    View: AdvancingTargetView,
    properties: {
        speed: { default: DEFAULT_SPEED },
        resetZ: { default: DEFAULT_RESET_Z },
        breachZ: { default: DEFAULT_BREACH_Z },
        idleColor: { type: "color", default: DEFAULT_IDLE_COLOR },
        hitColor: { type: "color", default: DEFAULT_HIT_COLOR },
        hitEventName: { type: "string", default: DEFAULT_HIT_EVENT },
        breachEventName: { type: "string", default: DEFAULT_BREACH_EVENT },
    },
};

export default AdvancingTargetComponent;
