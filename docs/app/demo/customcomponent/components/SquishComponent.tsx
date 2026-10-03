import { useEffect, useMemo } from "react";

import { MaterialOverridesProvider, type Component, type ComponentViewProps } from "react-three-game/viewer";

import { float, positionLocal, sin, time, uniform, vec3 } from "three/tsl";

const DEFAULT_AMOUNT = 0.3;

const DEFAULT_SPEED = 3.5;

const DEFAULT_BULGE = 0.45;

const DEFAULT_LIFT = 0.18;

export type SquishProperties = {
    amount?: number;
    speed?: number;
    bulge?: number;
    lift?: number;
};

const SquishComponent: Component<SquishProperties> = {
    name: "Squish",
    View: function SquishView({ properties, children }: ComponentViewProps<SquishProperties>) {
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
            amountNode.value = properties.amount;
            speedNode.value = properties.speed;
            bulgeNode.value = properties.bulge;
            liftNode.value = properties.lift;
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
    properties: {
        amount: { default: DEFAULT_AMOUNT, min: 0, max: 0.95, step: 0.01 },
        speed: { default: DEFAULT_SPEED, min: 0.1, step: 0.1 },
        bulge: { default: DEFAULT_BULGE, min: 0, max: 2, step: 0.01 },
        lift: { default: DEFAULT_LIFT, min: 0, max: 1, step: 0.01 },
    },
};

export default SquishComponent;
