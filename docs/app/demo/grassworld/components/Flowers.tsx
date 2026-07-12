import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { SRGBColorSpace } from "three";
import {
	cos,
	float,
	floor,
	Fn as typedFn,
	hash,
	If,
	INFINITY,
	instancedArray,
	instanceIndex,
	mix,
	sin,
	step,
	texture,
	uniform,
	uv,
	vec2,
	vec3,
	vec4,
} from "three/tsl";

const Fn: any = typedFn;
import {
	Color,
	InstancedMesh,
	Matrix4,
	PlaneGeometry,
	SpriteNodeMaterial,
	Vector2,
	Vector3,
	type NodeBuilder,
	type Renderer,
} from "three/webgpu";
import {
	assetManager,
	rendererManager,
	sceneManager,
	windManager,
	debugManager,
	gameDeltaTime,
	gameTime,
	usePlayerRuntime,
} from "./GrassWorldRuntime";
import { TSLUtils, VegetationSsboUtils } from "./TSLUtils";
import { withBasePath } from "../../../basePath";

const getConfig = () => {
	const FLOWER_WIDTH = 0.5;
	const FLOWER_HEIGHT = 1;
	const TILE_SIZE = 150;
	const FLOWERS_PER_SIDE = 64;
	const MIN_SCALE = 0.125;
	const MAX_SCALE = 0.2;
	return {
		MIN_SCALE,
		MAX_SCALE,
		FLOWER_WIDTH,
		FLOWER_HEIGHT,
		FLOWER_BOUNDING_SPHERE_RADIUS: FLOWER_HEIGHT,
		TILE_SIZE,
		TILE_HALF_SIZE: TILE_SIZE / 2,
		FLOWERS_PER_SIDE,
		COUNT: FLOWERS_PER_SIDE * FLOWERS_PER_SIDE,
		SPACING: TILE_SIZE / FLOWERS_PER_SIDE,
		WORKGROUP_SIZE: 64,
	};
};
const config = getConfig();

const uniforms = {
	uPlayerDeltaXZ: uniform(new Vector2(0, 0)),
	uPlayerPosition: uniform(new Vector3(0, 0, 0)),
	uCameraForward: uniform(new Vector3(0, 0, 0)),
	// culling
	uCameraMatrix: uniform(new Matrix4()), // MVP = Projection * View
	uFx: uniform(1.0),
	uFy: uniform(1.0),
	uCullPadNDCX: uniform(0.075), // small padding to hide rotation lag
	uCullPadNDCYNear: uniform(0.75), // small padding to avoid near clipping
	uCullPadNDCYFar: uniform(0.2), // small padding to avoid far clipping
	// tint
	uColor1: uniform(new Color().setRGB(0.02, 0.14, 0.33)),
	uColor2: uniform(new Color().setRGB(0.99, 0.64, 0.0)),
	uColorStrength: uniform(0.275),
};

class FlowersSsbo {
	// x -> offsetX (0 unused)
	// y -> offsetZ (0 unused)
	// z -> 0/12 offsetY - 12/13 visibility (9 unused)
	// w -> noise (0 unused - also not used currently)
	private buffer = instancedArray(config.COUNT, "vec4");

	constructor() {
		this.computeUpdate.onInit(({ renderer }: { renderer: Renderer }) => {
			renderer.computeAsync(this.computeInit);
		});
	}

	get computeBuffer() {
		return this.buffer;
	}

	getYOffset = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackUnits(
			data.z,
			0,
			12,
			0,
			Math.ceil(assetManager.resources.heightmap.userData.max),
		);
	});

	getVisibility = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackFlag(data.z, 12);
	});

	getNoise = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		const x = TSLUtils.unpackUnit(data.w, 0, 6);
		const y = TSLUtils.unpackUnit(data.w, 6, 6);
		const z = TSLUtils.unpackUnit(data.w, 12, 6);
		const w = TSLUtils.unpackUnit(data.w, 18, 6);
		return vec4(x, y, z, w);
	});

	private setYOffset = Fn(([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
		data.z = TSLUtils.packUnits(
			data.z,
			0,
			12,
			value,
			0,
			Math.ceil(assetManager.resources.heightmap.userData.max),
		);
		return data;
	});

	private setVisibility = Fn(([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
		data.z = TSLUtils.packFlag(data.z, 12, value);
		return data;
	});

	private setNoise = Fn(([data = vec4(0), value = vec4(0)], _builder: NodeBuilder) => {
		data.w = TSLUtils.packUnit(data.w, 0, 6, value.x);
		data.w = TSLUtils.packUnit(data.w, 6, 6, value.y);
		data.w = TSLUtils.packUnit(data.w, 12, 6, value.z);
		data.w = TSLUtils.packUnit(data.w, 18, 6, value.a);
		return data;
	});

	private computeInit = Fn(() => {
		const data = this.buffer.element(instanceIndex);

		// Position XZ
		const row = floor(float(instanceIndex).div(config.FLOWERS_PER_SIDE));
		const col = float(instanceIndex).mod(config.FLOWERS_PER_SIDE);

		const randX = hash(instanceIndex.add(4321));
		const randZ = hash(instanceIndex.add(1234));
		const offsetX = col
			.mul(config.SPACING)
			.sub(config.TILE_HALF_SIZE)
			.add(randX.mul(config.SPACING * 0.5));
		const offsetZ = row
			.mul(config.SPACING)
			.sub(config.TILE_HALF_SIZE)
			.add(randZ.mul(config.SPACING * 0.5));

		const _uv = vec3(offsetX, 0, offsetZ)
			.xz.add(config.TILE_HALF_SIZE)
			.div(config.TILE_SIZE)
			.abs();

		const noise = texture(assetManager.resources.noiseAtlas, _uv);
		data.assign(this.setNoise(data, noise));
		const wrapNoise = noise.r;

		const noiseX = wrapNoise.mul(99.37);
		const noiseZ = wrapNoise.mul(49.71);

		data.x = offsetX.add(noiseX);
		data.y = offsetZ.add(noiseZ);
	})().compute(config.COUNT, [config.WORKGROUP_SIZE]);

	computeUpdate = Fn(() => {
		const data = this.buffer.element(instanceIndex);
		// Position
		const pos = VegetationSsboUtils.wrapPosition(
			vec2(data.x, data.y),
			uniforms.uPlayerDeltaXZ,
			config.TILE_SIZE,
		);

		data.x = pos.x;
		data.y = pos.z;

		const worldPos = pos.add(uniforms.uPlayerPosition);

		// Visibility
		const isVisible = VegetationSsboUtils.computeVisibility(
			worldPos,
			uniforms.uCameraMatrix,
			uniforms.uFx,
			uniforms.uFy,
			config.FLOWER_BOUNDING_SPHERE_RADIUS,
			uniforms.uCullPadNDCX,
			uniforms.uCullPadNDCYNear,
			uniforms.uCullPadNDCYFar,
		);

		data.assign(this.setVisibility(data, isVisible));

		If(isVisible, () => {
			// Y offset
			const yOffset = VegetationSsboUtils.computeYOffset(worldPos);
			data.assign(this.setYOffset(data, yOffset));

			// Alpha
			const alphaVisibility = VegetationSsboUtils.computeAlpha(worldPos);
			data.assign(this.setVisibility(data, alphaVisibility));
		});
	})().compute(config.COUNT, [config.WORKGROUP_SIZE]);
}

class FlowersSystem {
	private isComputeInFlight = false;
	private ssbo: FlowersSsbo;
	private flowers: InstancedMesh;

	constructor() {
		this.ssbo = new FlowersSsbo();
		this.flowers = new InstancedMesh(
			new PlaneGeometry(1, 1),
			new FlowerMaterial(this.ssbo),
			config.COUNT,
		);
		sceneManager.scene.add(this.flowers);

		this.debug();
	}

	update(playerPosition: Vector3) {
		uniforms.uPlayerDeltaXZ.value.set(
			playerPosition.x - this.flowers.position.x,
			playerPosition.z - this.flowers.position.z,
		);
		uniforms.uPlayerPosition.value.copy(playerPosition);
		const projection = sceneManager.playerCamera.projectionMatrix;
		uniforms.uFx.value = projection.elements[0];
		uniforms.uFy.value = projection.elements[5];
		uniforms.uCameraMatrix.value
			.copy(projection)
			.multiply(sceneManager.playerCamera.matrixWorldInverse);
		sceneManager.playerCamera.getWorldDirection(uniforms.uCameraForward.value);
		this.flowers.position.copy(playerPosition).setY(0);
		if (this.isComputeInFlight) return;
		this.isComputeInFlight = true;
		rendererManager.renderer
			.computeAsync(this.ssbo.computeUpdate)
			.catch((error) => console.error("[Flowers] computeAsync failed:", error))
			.finally(() => { this.isComputeInFlight = false; });
	}

	private debug() {
		const folder = debugManager.panel.addFolder({
			title: "🌸 Flowers",
			expanded: false,
		});

		folder.addBinding(uniforms.uColor1, "value", {
			label: "Color 1",
			view: "color",
			color: { type: "float" },
		});
		folder.addBinding(uniforms.uColor2, "value", {
			label: "Color 2",
			view: "color",
			color: { type: "float" },
		});
		folder.addBinding(uniforms.uColorStrength, "value", {
			label: "Color strength",
			min: 0,
		});
	}
}

export default function Flowers() {
	const { scene } = useThree();
	const runtime = usePlayerRuntime();
	const edelweiss = useTexture(withBasePath("/grassworld/textures/edelweiss.png"));
	const systemRef = useRef<FlowersSystem | null>(null);
	const updateFrame = useRef(0);
	useMemo(() => { edelweiss.colorSpace = SRGBColorSpace; }, [edelweiss]);

	useEffect(() => {
		assetManager.resources.edelweiss = edelweiss;
		const previousChildren = new Set(scene.children);
		const system = new FlowersSystem();
		systemRef.current = system;
		const owned = scene.children.filter((child) => !previousChildren.has(child));
		return () => {
			systemRef.current = null;
			for (const child of owned) {
				scene.remove(child);
				const mesh = child as any;
				mesh.geometry?.dispose?.();
				mesh.material?.dispose?.();
			}
		};
	}, [edelweiss, scene]);

	useFrame(() => {
		updateFrame.current += 1;
		if (updateFrame.current < 16) return;
		systemRef.current?.update(runtime.current.position);
		updateFrame.current = 0;
	}, -4);
	return null;
}

class FlowerMaterial extends SpriteNodeMaterial {
	private ssbo: FlowersSsbo;
	constructor(ssbo: FlowersSsbo) {
		super();

		this.ssbo = ssbo;
		this.createFlowersMaterial();
	}

	private createFlowersMaterial() {
		this.precision = "lowp";
		this.stencilWrite = false;
		this.forceSinglePass = true;
		this.transparent = false;

		const data = this.ssbo.computeBuffer.element(instanceIndex);
		const isVisible = this.ssbo.getVisibility(data);
		// const noise = this.ssbo.getNoise(data);
		const x = data.x;
		const y = this.ssbo.getYOffset(data);
		const z = data.y;

		const rand1 = hash(instanceIndex.add(9234));
		const rand2 = hash(instanceIndex.add(33.87));

		// Position
		const windIntensity = windManager.uIntensity;
		const windDirection = windManager.uDirection;
		const timer = gameTime.add(
			gameDeltaTime.mul(float(2).add(windIntensity.mul(0.25))),
		);
		const swayX = sin(timer.add(rand1.mul(100))).mul(0.25);
		const swayY = rand2.mul(0.5);
		const swayZ = cos(timer.mul(2).add(rand2.mul(33.76))).mul(0.15);
		const swayOffset = vec3(swayX, swayY, swayZ);
		const offscreenOffset = uniforms.uCameraForward
			.mul(INFINITY)
			.mul(float(1).sub(isVisible));
		const offsetX = x.add(windDirection.x.mul(windIntensity).mul(0.5));
		const baseHeight = rand1.add(rand2).add(0.25).clamp();
		const offsetY = y.add(baseHeight);
		const offsetZ = z.add(windDirection.y.mul(windIntensity).mul(0.5));
		const basePosition = vec3(offsetX, offsetY, offsetZ);
		this.positionNode = basePosition.add(swayOffset).add(offscreenOffset);

		// Size
		this.scaleNode = vec3(
			rand1.remap(0, 1, config.MIN_SCALE, config.MAX_SCALE),
		);

		// Diffuse
		const flower = texture(assetManager.resources.edelweiss, uv());
		const tint = mix(uniforms.uColor1, uniforms.uColor2, rand2);
		const sign = step(rand2, rand1).mul(2).sub(1);
		const color = mix(tint, flower.rgb, rand1.add(rand2.mul(sign)));
		this.colorNode = color.mul(uniforms.uColorStrength);

		// Opacity
		this.opacityNode = isVisible.mul(flower.a);
		this.alphaTest = 0.15;
	}
}
