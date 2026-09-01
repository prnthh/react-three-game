import { useState, type MutableRefObject } from "react";
import { createNodeComponentType, useSceneComponents } from "react-three-game";
import {
	Color,
	PerspectiveCamera,
	Scene,
	Texture,
	Vector2,
	Vector3,
} from "three";
import { uniform } from "three/tsl";
import type { WebGPURenderer } from "three/webgpu";

export type PlayerRuntime = {
	position: Vector3;
};

export const GRASS_WORLD_PLAYER_COMPONENT = createNodeComponentType<PlayerRuntime>("GrassWorldPlayer");

export function usePlayerRuntime(): MutableRefObject<PlayerRuntime> {
	const players = useSceneComponents(GRASS_WORLD_PLAYER_COMPONENT);
	const [fallback] = useState<PlayerRuntime>(() => ({
		position: new Vector3(),
	}));
	return { current: players[0]?.value ?? fallback };
}

export const assetManager = {
	resources: {} as Record<string, Texture>,
};

export const sceneManager = {
	scene: new Scene(),
	playerCamera: new PerspectiveCamera(),
};

export const rendererManager = {
	renderer: null as unknown as WebGPURenderer,
	isWebGPU: true,
};

export const worldConfig = {
	mapSize: 512,
	halfMapSize: 256,
};

type DebugFolder = {
	expanded: boolean;
	addFolder: (options?: unknown) => DebugFolder;
	addBinding: (...args: unknown[]) => { on: (...args: unknown[]) => undefined };
};

const noopFolder: DebugFolder = {
	expanded: false,
	addFolder: () => noopFolder,
	addBinding: () => ({ on: () => undefined }),
};
export const debugManager: { panel: Pick<DebugFolder, "addFolder"> } = {
	panel: { addFolder: () => noopFolder },
};

export const lightingManager = {
	sunDirection: new Vector3(-1, -1, -1).normalize(),
	sunColor: new Color(1, 0.82, 0.58),
};

export const windManager = {
	uDirection: uniform(new Vector2(0.7, 0.3).normalize()),
	uIntensity: uniform(0.28),
};

export const gameTime = uniform(0);
export const gameDeltaTime = uniform(0);

export const GameTime = {
	timeSeconds: 0,
	update(deltaSeconds: number) {
		this.timeSeconds += deltaSeconds;
		gameDeltaTime.value = deltaSeconds;
		gameTime.value = this.timeSeconds;
	},
};

export function configureRuntime({
	scene,
	camera,
	renderer,
	mapSize,
	resources,
}: {
	scene: Scene;
	camera: PerspectiveCamera;
	renderer: WebGPURenderer;
	mapSize: number;
	resources: Record<string, Texture>;
}) {
	sceneManager.scene = scene;
	sceneManager.playerCamera = camera;
	rendererManager.renderer = renderer;
	worldConfig.mapSize = mapSize;
	worldConfig.halfMapSize = mapSize / 2;
	Object.assign(assetManager.resources, resources);
}
