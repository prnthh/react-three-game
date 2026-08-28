import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
    gameEvents,
    useNode,
    useNodeObject,
    type Component,
    type ComponentViewProps,
} from "react-three-game";
import { FieldRenderer } from "react-three-game/editor";
import type { ComponentEditorProps, FieldDefinition } from "react-three-game/editor";
import type { Material, Mesh, Object3D } from "three";
import { MACHINEGUN_PROJECTILE_ID_PREFIX } from "./IndustrialMachineGunComponent";

type AdvancingTargetProperties = {
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

const advancingTargetFields = [
    { name: "speed", type: "number", label: "Speed", min: 0, step: 0.1 },
    { name: "resetZ", type: "number", label: "Reset Z", step: 0.5 },
    { name: "breachZ", type: "number", label: "Breach Z", step: 0.5 },
    { name: "idleColor", type: "color", label: "Idle Color" },
    { name: "hitColor", type: "color", label: "Hit Color" },
    { name: "hitEventName", type: "string", label: "Hit Event" },
    { name: "breachEventName", type: "string", label: "Breach Event" },
] satisfies FieldDefinition<AdvancingTargetProperties>[];

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

function isHitForNode(payload: unknown, nodeId: string) {
    const detail = payload as {
        sourceEntityId?: unknown;
        sourceNodeId?: unknown;
        targetEntityId?: unknown;
        targetNodeId?: unknown;
    } | null;

    const sourceId = detail?.sourceNodeId ?? detail?.sourceEntityId;
    const targetId = detail?.targetNodeId ?? detail?.targetEntityId;
    return sourceId === nodeId
        && typeof targetId === "string"
        && targetId.startsWith(MACHINEGUN_PROJECTILE_ID_PREFIX);
}

function AdvancingTargetEditor({ properties, update }: ComponentEditorProps<AdvancingTargetProperties>) {
    return <FieldRenderer fields={advancingTargetFields} values={properties} onChange={update} />;
}

function AdvancingTargetView({
    properties,
    children,
}: ComponentViewProps<AdvancingTargetProperties>) {
    const { editMode, nodeId } = useNode();
    const objectRef = useNodeObject();
    const elapsedRef = useRef(0);
    const hitFlashRef = useRef(0);
    const resetCountRef = useRef(0);

    useEffect(() => {
        const eventName = properties.hitEventName?.trim() || DEFAULT_HIT_EVENT;
        const stopHit = gameEvents.on(eventName, (payload: unknown) => {
            if (!isHitForNode(payload, nodeId)) return;

            const object = objectRef.current;
            if (!object) return;

            const resetZ = properties.resetZ ?? DEFAULT_RESET_Z;
            const spread = 2.5 + (resetCountRef.current % 3) * 1.35;
            object.position.z = resetZ - spread;
            hitFlashRef.current = 0.2;
            resetCountRef.current += 1;
            setObjectColor(object, properties.hitColor ?? DEFAULT_HIT_COLOR);
        });

        return stopHit;
    }, [nodeId, objectRef, properties.hitColor, properties.hitEventName, properties.resetZ]);

    useFrame((_, delta) => {
        const object = objectRef.current;
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
                sourceEntityId: nodeId,
                sourceNodeId: nodeId,
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
    Editor: AdvancingTargetEditor,
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
