import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import {
    PrefabEditorMode,
    useNodeObject,
    useScene,
    type Component,
    type ComponentViewProps,
} from "react-three-game";

type Vector3Tuple = [number, number, number];

type ConstantVelocityProperties = {
    velocity?: Vector3Tuple;
};

const worldPosition = new Vector3();
const worldDestination = new Vector3();
const localPosition = new Vector3();
const localDestination = new Vector3();

function ConstantVelocityView({ properties }: ComponentViewProps<ConstantVelocityProperties>) {
    const objectRef = useNodeObject();
    const { mode } = useScene();

    useFrame((_, delta) => {
        if (mode !== PrefabEditorMode.Play) return;
        const object = objectRef.current;
        const velocity = properties.velocity ?? [0, 0, 0];
        if (!object || delta <= 0 || (velocity[0] === 0 && velocity[1] === 0 && velocity[2] === 0)) return;

        object.getWorldPosition(worldPosition);
        worldDestination.set(
            worldPosition.x + velocity[0] * delta,
            worldPosition.y + velocity[1] * delta,
            worldPosition.z + velocity[2] * delta,
        );

        if (object.parent) {
            localPosition.copy(worldPosition);
            localDestination.copy(worldDestination);
            object.parent.worldToLocal(localPosition);
            object.parent.worldToLocal(localDestination);
            object.position.add(localDestination.sub(localPosition));
        } else {
            object.position.copy(worldDestination);
        }
    }, -20);

    return null;
}

const ConstantVelocityComponent: Component<ConstantVelocityProperties> = {
    name: "ConstantVelocity",
    View: ConstantVelocityView,
    properties: {
        velocity: { type: "vector3", default: [0, 0, 0] },
    },
};

export default ConstantVelocityComponent;
