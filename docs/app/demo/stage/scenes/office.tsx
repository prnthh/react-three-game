"use client";

import { useRef } from "react";
import type { Prefab } from "react-three-game/editor";
import officePrefab from "../../../../public/prefabs/stage.json";
import outsidePrefab from "../../../../public/prefabs/stage-outside.json";
import { withBasePath } from "../../../basePath";
import AnimationMixer from "../components/AnimationMixer";
import SkinnedMesh, { type SkinnedMeshRef } from "../components/SkinnedMesh";
import type { StageScene } from "./types";

function OfficeContent() {
    const characterRef = useRef<SkinnedMeshRef>(null);

    return (
        <group position={[1.25, 0, -0.1]} rotation={[0, -0.25, 0]} scale={[0.92, 0.92, 0.92]}>
            <SkinnedMesh ref={characterRef} model={withBasePath("/models/human/onimilio.glb")} />
            <AnimationMixer skinnedMeshRef={characterRef} />
        </group>
    );
}

const officeScene: StageScene = {
    id: "office",
    prefab: officePrefab as Prefab,
    playerStart: [-1.25, 0, 0.25],
    transition: (nodeId) => nodeId === "stage-left-door"
        ? { prefab: outsidePrefab as Prefab, spawn: [-2.05, 0, 0.95] }
        : null,
    Content: OfficeContent,
};

export default officeScene;
