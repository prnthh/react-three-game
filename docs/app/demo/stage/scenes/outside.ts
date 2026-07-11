import type { Prefab } from "react-three-game/editor";
import officePrefab from "../../../../public/prefabs/stage.json";
import outsidePrefab from "../../../../public/prefabs/stage-outside.json";
import type { StageScene } from "./types";

const outsideScene: StageScene = {
    id: "junkyard",
    prefab: outsidePrefab as Prefab,
    playerStart: [-2.05, 0, 0.95],
    transition: (nodeId) => nodeId === "stage-office-exterior-door"
        ? { prefab: officePrefab as Prefab, spawn: [-3.35, 0, 1.15] }
        : null,
};

export default outsideScene;
