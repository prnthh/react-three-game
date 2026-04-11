import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Component, FieldDefinition, FieldRenderer } from "react-three-game";
import { Group, Material, Mesh, Object3D } from "three";
import { float, positionLocal, sin, time, uniform, vec3 } from "three/tsl";

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

type NodeMaterialLike = Material & {
    isNodeMaterial?: boolean;
    positionNode?: unknown;
    castShadowPositionNode?: unknown;
    needsUpdate?: boolean;
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

function isNodeMaterial(material: Material | undefined | null): material is NodeMaterialLike {
    return Boolean(material && (material as NodeMaterialLike).isNodeMaterial);
}

function SquishView({ properties, children }: { properties: SquishProperties; children?: React.ReactNode }) {
    const groupRef = useRef<Group>(null);
    const originalsRef = useRef(new WeakMap<NodeMaterialLike, { positionNode: unknown; castShadowPositionNode: unknown }>());
    const patchedMaterialsRef = useRef(new Set<NodeMaterialLike>());
    const observedObjectsRef = useRef(new WeakSet<Object3D>());

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
            positionLocal.z.mul(sidewaysScale)
        );
    }, [amountNode, speedNode, bulgeNode, liftNode]);

    useEffect(() => {
        amountNode.value = properties.amount ?? DEFAULT_AMOUNT;
        speedNode.value = properties.speed ?? DEFAULT_SPEED;
        bulgeNode.value = properties.bulge ?? DEFAULT_BULGE;
        liftNode.value = properties.lift ?? DEFAULT_LIFT;
    }, [properties.amount, properties.speed, properties.bulge, properties.lift, amountNode, speedNode, bulgeNode, liftNode]);

    const patchMeshMaterials = (mesh: Mesh) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        for (const material of materials) {
            if (!isNodeMaterial(material)) {
                continue;
            }

            if (!originalsRef.current.has(material)) {
                originalsRef.current.set(material, {
                    positionNode: material.positionNode ?? null,
                    castShadowPositionNode: material.castShadowPositionNode ?? null,
                });
            }

            material.positionNode = squishPositionNode;
            material.castShadowPositionNode = squishPositionNode;
            material.needsUpdate = true;
            patchedMaterialsRef.current.add(material);
        }
    };

    const restoreMeshMaterials = (mesh: Mesh) => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        for (const material of materials) {
            if (!isNodeMaterial(material)) {
                continue;
            }

            const original = originalsRef.current.get(material);
            if (!original) {
                continue;
            }

            material.positionNode = original.positionNode;
            material.castShadowPositionNode = original.castShadowPositionNode;
            material.needsUpdate = true;
            patchedMaterialsRef.current.delete(material);
        }
    };

    const handleChildAdded = (event: { child?: Object3D }) => {
        if (event.child) {
            observeSubtree(event.child);
        }
    };

    const handleChildRemoved = (event: { child?: Object3D }) => {
        if (event.child) {
            cleanupSubtree(event.child);
        }
    };

    const observeSubtree = (root: Object3D) => {
        root.traverse(object => {
            if (!observedObjectsRef.current.has(object)) {
                object.addEventListener("childadded", handleChildAdded);
                object.addEventListener("childremoved", handleChildRemoved);
                observedObjectsRef.current.add(object);
            }

            if (object instanceof Mesh) {
                patchMeshMaterials(object);
            }
        });
    };

    const cleanupSubtree = (root: Object3D) => {
        root.traverse(object => {
            if (observedObjectsRef.current.has(object)) {
                object.removeEventListener("childadded", handleChildAdded);
                object.removeEventListener("childremoved", handleChildRemoved);
            }

            if (object instanceof Mesh) {
                restoreMeshMaterials(object);
            }
        });
    };

    useLayoutEffect(() => {
        const group = groupRef.current;
        if (!group) {
            return;
        }

        group.traverse(object => {
            if (object instanceof Mesh) {
                patchMeshMaterials(object);
            }
        });
    });

    useEffect(() => {
        const group = groupRef.current;
        if (!group) {
            return;
        }

        observeSubtree(group);

        return () => {
            cleanupSubtree(group);

            for (const material of patchedMaterialsRef.current) {
                const original = originalsRef.current.get(material);
                if (!original) {
                    continue;
                }

                material.positionNode = original.positionNode;
                material.castShadowPositionNode = original.castShadowPositionNode;
                material.needsUpdate = true;
            }

            patchedMaterialsRef.current.clear();
        };
    }, [children, squishPositionNode]);

    return <group ref={groupRef}>{children}</group>;
}

const SquishComponent: Component = {
    name: "Squish",
    Editor: SquishComponentEditor,
    View: SquishView,
    defaultProperties: {
        amount: DEFAULT_AMOUNT,
        speed: DEFAULT_SPEED,
        bulge: DEFAULT_BULGE,
        lift: DEFAULT_LIFT,
    },
};

export default SquishComponent;