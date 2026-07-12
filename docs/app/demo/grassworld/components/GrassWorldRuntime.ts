import { createContext, createElement, useContext, useRef, type MutableRefObject, type ReactNode } from "react";
import {
	Color,
	Matrix4,
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
	grounded: boolean;
	chunk: Vector2;
};

const PlayerRuntimeContext = createContext<MutableRefObject<PlayerRuntime> | null>(null);

export function GrassWorldRuntimeProvider({ children }: { children: ReactNode }) {
	const runtime = useRef<PlayerRuntime>({
		position: new Vector3(),
		grounded: false,
		chunk: new Vector2(),
	});
	return createElement(PlayerRuntimeContext.Provider, { value: runtime }, children);
}

export function usePlayerRuntime() {
	const runtime = useContext(PlayerRuntimeContext);
	if (!runtime) throw new Error("usePlayerRuntime must be used within GrassWorldRuntimeProvider");
	return runtime;
}

export const assetManager = {
	resources: {} as Record<string, any>,
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

const noopFolder: any = {
	expanded: false,
	addFolder: (_options?: unknown) => noopFolder,
	addBinding: () => ({ on: () => undefined }),
};
export const debugManager = { panel: { addFolder: (_options?: unknown) => noopFolder } };

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
