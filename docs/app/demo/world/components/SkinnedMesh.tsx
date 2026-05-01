import { useGLTF } from "@react-three/drei";
import { forwardRef, useImperativeHandle, useMemo, type ReactNode } from "react";
import { Mesh } from "three";
import type { AnimationClip, Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export type SkinnedMeshRef = {
    model: Object3D;
    animations: AnimationClip[];
};

type SkinnedMeshProps = {
    model: string;
    children?: ReactNode;
};

type LoadedSkinnedMesh = {
    scene: Object3D;
    animations: AnimationClip[];
};

const SkinnedMesh = forwardRef<SkinnedMeshRef, SkinnedMeshProps>(function SkinnedMesh({
    model: modelPath,
    children,
}, ref) {
    const { scene, animations } = useGLTF(modelPath) as LoadedSkinnedMesh;

    const clonedModel = useMemo(() => {
        const clonedScene = cloneSkeleton(scene) as Object3D;

        clonedScene.traverse((object) => {
            if (object instanceof Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
                object.frustumCulled = false;
            }
        });

        return clonedScene;
    }, [scene]);

    useImperativeHandle(ref, () => ({
        model: clonedModel,
        animations,
    }), [animations, clonedModel]);

    return (
        <>
            <primitive object={clonedModel} />
            {children}
        </>
    );
});

export default SkinnedMesh;
