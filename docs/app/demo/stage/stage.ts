import type { StagePoint } from "./game";

export const INTERACTION_ENTER_EVENT = "stage:interaction-enter";
export const INTERACTION_EXIT_EVENT = "stage:interaction-exit";
export const MOVE_EVENT = "stage:move";
export const TRANSITION_EVENT = "stage:transition";
export type MoveRequest = { destination: StagePoint | null };
