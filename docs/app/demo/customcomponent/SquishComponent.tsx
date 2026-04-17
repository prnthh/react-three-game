import { useEffect, useMemo } from "react";
import { Component, FieldDefinition, FieldRenderer, MaterialOverridesProvider, float, positionLocal, sin, time, uniform, vec3 } from "react-three-game";

const DEFAULT_AMOUNT = 0.3;
const DEFAULT_SPEED = 3.5;
const DEFAULT_BULGE = 0.45;
const DEFAULT_LIFT = 0.18;

type SquishProperties = {
    amount?: number;
    speed?: number;
    bulge?: number;
    lift?: number;
};

const squishFields: FieldDefinition[] = [
    { name: "amount", type: "number", label: "Amount", min: 0, max: 0.95, step: 0.01 },
    { name: "speed", type: "number", label: "Speed", min: 0.1, step: 0.1 },
    { name: "bulge", type: "number", label: "Bulge", min: 0, max: 2, step: 0.01 },
    { name: "lift", type: "number", label: "Lift", min: 0, max: 1, step: 0.01 },
];

function SquishComponentEditor({ component, onUpdate }: { component: any; onUpdate: (newComp: any) => void }) {
    return <FieldRenderer fields={squishFields} values={component.properties} onChange={onUpdate} />;
}

const SquishComponent: Component = {
    name: "Squish",
    Editor: SquishComponentEditor,
    View: function SquishView({ properties, children }: { properties: SquishProperties; children?: React.ReactNode }) {
        const amountNode = useMemo(() => uniform(DEFAULT_AMOUNT), []);
        const speedNode = useMemo(() => uniform(DEFAULT_SPEED), []);
        const bulgeNode = useMemo(() => uniform(DEFAULT_BULGE), []);
        const liftNode = useMemo(() => uniform(DEFAULT_LIFT), []);

        const squishPositionNode = useMemo(() => {
            const pulse = sin(time.mul(speedNode).sub(float(Math.PI / 2))).add(1).mul(0.5);
            const compression = float(1).sub(pulse.mul(amountNode));
            const sidewaysScale = float(1).add(pulse.mul(amountNode).mul(bulgeNode));
            const liftedY = positionLocal.y.mul(compression).add(pulse.mul(amountNode).mul(liftNode));

            return vec3(
                positionLocal.x.mul(sidewaysScale),
                liftedY,
                positionLocal.z.mul(sidewaysScale),
            );
        }, [amountNode, speedNode, bulgeNode, liftNode]);

        useEffect(() => {
            amountNode.value = properties.amount ?? DEFAULT_AMOUNT;
            speedNode.value = properties.speed ?? DEFAULT_SPEED;
            bulgeNode.value = properties.bulge ?? DEFAULT_BULGE;
            liftNode.value = properties.lift ?? DEFAULT_LIFT;
        }, [properties.amount, properties.speed, properties.bulge, properties.lift, amountNode, speedNode, bulgeNode, liftNode]);

        const overrides = useMemo(() => ({
            positionNode: squishPositionNode,
            castShadowPositionNode: squishPositionNode,
        }), [squishPositionNode]);

        return (
            <MaterialOverridesProvider overrides={overrides}>
                {children}
            </MaterialOverridesProvider>
        );
    },
    defaultProperties: {
        amount: DEFAULT_AMOUNT,
        speed: DEFAULT_SPEED,
        bulge: DEFAULT_BULGE,
        lift: DEFAULT_LIFT,
    },
};

export default SquishComponent;