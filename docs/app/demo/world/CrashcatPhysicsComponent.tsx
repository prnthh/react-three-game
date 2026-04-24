import { useLayoutEffect } from "react";
import { Component, FieldDefinition, FieldRenderer, useCurrentNodeObject } from "react-three-game";

type CrashcatPhysicsProperties = {
    shape?: "autoBox" | "box" | "sphere";
    motionType?: "static" | "dynamic" | "kinematic";
    sensor?: boolean;
    friction?: number;
    restitution?: number;
    radius?: number;
};

const crashcatPhysicsFields: FieldDefinition[] = [
    {
        name: "shape",
        type: "select",
        label: "Shape",
        options: [
            { value: "autoBox", label: "Auto Box" },
            { value: "box", label: "Box" },
            { value: "sphere", label: "Sphere" },
        ],
    },
    {
        name: "motionType",
        type: "select",
        label: "Motion Type",
        options: [
            { value: "static", label: "Static" },
            { value: "dynamic", label: "Dynamic" },
            { value: "kinematic", label: "Kinematic" },
        ],
    },
    { name: "sensor", type: "boolean", label: "Sensor" },
    { name: "friction", type: "number", label: "Friction", step: 0.05 },
    { name: "restitution", type: "number", label: "Restitution", step: 0.05 },
    { name: "radius", type: "number", label: "Sphere Radius", step: 0.05 },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCollider(properties: CrashcatPhysicsProperties) {
    return Object.entries(properties).reduce<Record<string, unknown>>((result, [key, value]) => {
        if (value === undefined) return result;
        result[key] = value;
        return result;
    }, {});
}

function CrashcatPhysicsEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <FieldRenderer
            fields={crashcatPhysicsFields}
            values={component.properties}
            onChange={onUpdate}
        />
    );
}

function CrashcatPhysicsView({ properties, children }: { properties: CrashcatPhysicsProperties; children?: React.ReactNode }) {
    const objectRef = useCurrentNodeObject();

    useLayoutEffect(() => {
        const object = objectRef.current;
        if (!object) return;

        const existingCrashcat = isRecord(object.userData.crashcat) ? object.userData.crashcat : {};
        object.userData.crashcat = {
            ...existingCrashcat,
            collider: normalizeCollider(properties),
        };

        return () => {
            const currentCrashcat = isRecord(object.userData.crashcat) ? { ...object.userData.crashcat } : null;
            if (!currentCrashcat) return;

            delete currentCrashcat.collider;
            object.userData.crashcat = Object.keys(currentCrashcat).length > 0 ? currentCrashcat : undefined;
        };
    }, [objectRef, properties]);

    return <>{children}</>;
}

const CrashcatPhysicsComponent: Component = {
    name: "CrashcatPhysics",
    Editor: CrashcatPhysicsEditor,
    View: CrashcatPhysicsView,
    defaultProperties: {
        shape: "autoBox",
        motionType: "static",
        sensor: false,
    },
};

export default CrashcatPhysicsComponent;