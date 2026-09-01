"use client";

import type { Prefab } from "react-three-game";
import officePrefab from "../../../../public/prefabs/stage.json";
import outsidePrefab from "../../../../public/prefabs/stage-outside.json";
import type { StageScene } from "./types";

const officeScene: StageScene = {
    id: "office",
    prefab: officePrefab as Prefab,
    playerStart: [-1.25, 0, 0.25],
    transition: (nodeId) => nodeId === "stage-left-door"
        ? { prefab: outsidePrefab as Prefab, spawn: [-0.9, 0, -0.35] }
        : null,
};

export default officeScene;
