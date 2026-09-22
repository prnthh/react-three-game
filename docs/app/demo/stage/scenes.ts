import type { Prefab } from "react-three-game/viewer";
import officePrefab from "../../../public/prefabs/stage.json";
import outsidePrefab from "../../../public/prefabs/stage-outside.json";
import type { StagePoint } from "./stage";

export type StageScene = { id: string; prefab: Prefab; playerStart: StagePoint };
export const officeScene: StageScene = { id: "office", prefab: officePrefab as Prefab, playerStart: [-1.25, 0, 0.25] };
export const outsideScene: StageScene = { id: "junkyard", prefab: outsidePrefab as Prefab, playerStart: [-0.9, 0, -0.35] };
export const STAGE_SCENES = [officeScene, outsideScene];
