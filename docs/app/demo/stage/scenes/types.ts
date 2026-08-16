import type { ComponentType } from "react";
import type { Prefab } from "react-three-game";
import type { StagePoint } from "../StageInteractionComponent";

export type SceneTransition = {
    prefab: Prefab;
    spawn: StagePoint;
};

export type StageScene = {
    id: string;
    prefab: Prefab;
    playerStart: StagePoint;
    transition: (nodeId: string) => SceneTransition | null;
    Content?: ComponentType;
};
