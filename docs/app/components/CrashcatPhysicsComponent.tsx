import { BooleanField, Component, FieldDefinition, FieldRenderer, StringField, Vector3Field } from "react-three-game";

type CrashcatPhysicsProperties = {
    shape?: "autoBox" | "box" | "sphere";
    motionType?: "static" | "dynamic" | "kinematic";
    motionQuality?: "discrete" | "linearCast";
    sensor?: boolean;
    friction?: number;
    restitution?: number;
    radius?: number;
    linearVelocity?: [number, number, number];
    collisionEnter?: string;
    collisionExit?: string;
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
    { name: "friction", type: "number", label: "Friction", step: 0.05 },
    { name: "restitution", type: "number", label: "Restitution", step: 0.05 },
    { name: "radius", type: "number", label: "Sphere Radius", step: 0.05 },
];

function CrashcatPhysicsEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <FieldRenderer
                fields={crashcatPhysicsFields}
                values={component.properties}
                onChange={onUpdate}
            />
            <BooleanField name="sensor" label="Sensor" values={component.properties} onChange={onUpdate} fallback={false} />
            <FieldRenderer
                fields={[
                    {
                        name: "motionQuality",
                        type: "select",
                        label: "Motion Quality",
                        options: [
                            { value: "discrete", label: "Discrete" },
                            { value: "linearCast", label: "Linear Cast" },
                        ],
                    },
                ]}
                values={component.properties}
                onChange={onUpdate}
            />
            <Vector3Field name="linearVelocity" label="Linear Velocity" values={component.properties} onChange={onUpdate} fallback={[0, 0, 0]} />
            <StringField name="collisionEnter" label="Collision Enter" values={component.properties} onChange={onUpdate} fallback="" />
            <StringField name="collisionExit" label="Collision Exit" values={component.properties} onChange={onUpdate} fallback="" />
        </div>
    );
}

const CrashcatPhysicsComponent: Component = {
    name: "CrashcatPhysics",
    Editor: CrashcatPhysicsEditor,
    defaultProperties: {
        shape: "autoBox",
        motionType: "static",
        sensor: false,
        motionQuality: "discrete",
    },
};

export default CrashcatPhysicsComponent;