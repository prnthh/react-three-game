import { createNodeComponentType } from "react-three-game/viewer";
import type { RefObject } from "react";
import type { RigidBody } from "crashcat";

export interface FirstPersonPlayerRef { getBody(): RigidBody | null }

export type PlayerControllerProperties = {
    radius?: number;
    halfHeightOfCylinder?: number;
    maxSpeed?: number;
    jumpSpeed?: number;
    cameraHeight?: number;
};

export type PlayerRegistration = Required<PlayerControllerProperties> & {
    runtime: RefObject<FirstPersonPlayerRef | null>;
    getPosition(): [number, number, number];
};

export const PLAYER_CONTROLLER_COMPONENT = createNodeComponentType<PlayerRegistration>("KillboxPlayer");

