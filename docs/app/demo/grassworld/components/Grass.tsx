import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DataTexture,
	FloatType,
	InstancedMesh,
	LinearFilter,
	Matrix4,
	RGBAFormat,
	RedFormat,
	RepeatWrapping,
	StaticDrawUsage,
	UnsignedByteType,
	Vector2,
	Vector3,
	type PerspectiveCamera,
} from "three";
import {
	Fn as typedFn,
	mix,
	uniform,
	uv,
	instancedArray,
	instanceIndex,
	hash,
	float,
	floor,
	vec3,
	vec4,
	smoothstep,
	vec2,
	texture,
	step,
	sin,
	abs,
	clamp,
	If,
	PI2,
	remap,
	fract,
	INFINITY,
} from "three/tsl";

const Fn: any = typedFn;
import {
	assetManager,
	configureRuntime,
	sceneManager,
	rendererManager,
	debugManager,
	gameTime,
	usePlayerRuntime,
	lightingManager,
	windManager,
} from "./GrassWorldRuntime";
import { TSLUtils, VegetationSsboUtils } from "./TSLUtils";
import { SpriteNodeMaterial } from "three/webgpu";
import type { NodeBuilder, Renderer, WebGPURenderer } from "three/webgpu";
import { withBasePath } from "../../../basePath";

const getConfig = () => {
	const BLADE_WIDTH = 0.06;
	const BLADE_HEIGHT = 1.75;
	const TILE_SIZE = 130;
	// Keep workgroup alignment while avoiding the source world's 1.18M-instance
	// budget inside the heavier PrefabEditor/runtime stack.
	const BLADES_PER_SIDE = 896;
	return {
		SEGMENTS: 4,
		BLADE_WIDTH,
		BLADE_HEIGHT,
		BLADE_BOUNDING_SPHERE_RADIUS: BLADE_HEIGHT,
		TILE_SIZE,
		TILE_HALF_SIZE: TILE_SIZE / 2,
		BLADES_PER_SIDE,
		COUNT: BLADES_PER_SIDE * BLADES_PER_SIDE,
		SPACING: TILE_SIZE / BLADES_PER_SIDE,
		WORKGROUP_SIZE: 64,
	};
};

const config = getConfig();

const uniforms = {
	// culling
	uCameraMatrix: uniform(new Matrix4()), // MVP = Projection * View
	uFx: uniform(1.0),
	uFy: uniform(1.0),
	uCullPadNDCX: uniform(0.075), // small padding to hide rotation lag
	uCullPadNDCYNear: uniform(0.75), // small padding to avoid near clipping
	uCullPadNDCYFar: uniform(0.2), // small padding to avoid far clipping
	// other
	uPlayerPosition: uniform(new Vector3(0, 0, 0)),
	uPlayerDeltaXZ: uniform(new Vector2(0, 0)),
	uPlayerRadius: uniform(0.5),
	uCameraForward: uniform(new Vector3(0, 0, 0)),
	uSunDir: uniform(new Vector3(0)),
	// Scale
	uBladeMinScale: uniform(0.75),
	uBladeMaxScale: uniform(2),
	// Trail
	uTrailGrowthRate: uniform(0.04),
	uTrailMinScale: uniform(0.25),
	uTrailRadius: uniform(1),
	uTrailRadiusSquared: uniform(1),
	uKDown: uniform(0.4),
	// Wind
	uWindStrength: uniform(0.4),
	uWindSpeed: uniform(0.25),
	uvWindScale: uniform(1.75),
	// Color
	uBaseColor: uniform(new Color().setRGB(0.55, 0.42, 0.19)),
	uTipColor: uniform(new Color().setRGB(0.29, 0.47, 0.04)),
	uColorMixFactor: uniform(0.125),
	uColorVariationStrength: uniform(2.75),
	uAoScale: uniform(0.5),
	uAoRimSmoothness: uniform(5),
	uAoRadius: uniform(25),
	uAoRadiusSquared: uniform(25 * 25),
	uWindColorStrength: uniform(0.6),
	uBaseWindShade: uniform(0.75),
	uBaseShadeHeight: uniform(1),
	// Stochastic keep
	uR0: uniform(10),
	uR1: uniform(60),
	uPMin: uniform(0.1),
	// Rotation
	uBaseBending: uniform(2),
};

class GrassSsbo {
	// x -> offsetX (0 unused)
	// y -> offsetZ (0 unused)
	// z -> 0/12 windX - 12/12 windZ (0 unused)
	// w -> 0/8 current scale - 8/8 original scale - 16/1 shadow - 17/1 visibility - 18/6 wind noise factor (1 unused)
	private buffer1 = instancedArray(config.COUNT, "vec4");
	// x -> 0/4 position based noise - 4/1 is far - 5/19 offsetY (0 unused)
	private buffer2 = instancedArray(config.COUNT, "float");

	constructor() {
		this.computeUpdate.onInit(({ renderer }: { renderer: Renderer }) => {
			renderer.computeAsync(this.computeInit);
		});
	}

	get computeBuffer1() {
		return this.buffer1;
	}

	get computeBuffer2() {
		return this.buffer2;
	}

	getYOffset = Fn(([data = float(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackUnits(
			data,
			5,
			19,
			0,
			Math.ceil(assetManager.resources.heightmap.userData.max),
		);
	});

	getWind = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		const x = TSLUtils.unpackUnits(data.z, 0, 12, -2, 2);
		const z = TSLUtils.unpackUnits(data.z, 12, 12, -2, 2);
		return vec2(x, z);
	});

	getScale = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackUnits(
			data.w,
			0,
			8,
			uniforms.uTrailMinScale,
			uniforms.uBladeMaxScale,
		);
	});

	getOriginalScale = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackUnits(
			data.w,
			8,
			8,
			uniforms.uBladeMinScale,
			uniforms.uBladeMaxScale,
		);
	});

	getVisibility = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackFlag(data.w, 17);
	});

	getWindNoise = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackUnit(data.w, 18, 6);
	});

	getPositionNoise = Fn(([data = float(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackUnit(data, 0, 4);
	});

	getShadowFactor = Fn(([data = vec4(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackFlag(data.w, 16);
	});

	getIsFar = Fn(([data = float(0)], _builder: NodeBuilder) => {
		return TSLUtils.unpackFlag(data, 4);
	});

	private setYOffset = Fn(([data = float(0), value = float(0)], _builder: NodeBuilder) => {
		return TSLUtils.packUnits(
			data,
			5,
			19,
			value,
			0,
			Math.ceil(assetManager.resources.heightmap.userData.max),
		);
	});

	private setWind = Fn(([data = vec4(0), value = vec2(0)], _builder: NodeBuilder) => {
		data.z = TSLUtils.packUnits(data.z, 0, 12, value.x, -2, 2);
		data.z = TSLUtils.packUnits(data.z, 12, 12, value.y, -2, 2);
		return data;
	});

	private setScale = Fn(([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
		data.w = TSLUtils.packUnits(
			data.w,
			0,
			8,
			value,
			uniforms.uTrailMinScale,
			uniforms.uBladeMaxScale,
		);
		return data;
	});

	private setOriginalScale = Fn(
		([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
			data.w = TSLUtils.packUnits(
				data.w,
				8,
				8,
				value,
				uniforms.uBladeMinScale,
				uniforms.uBladeMaxScale,
			);
			return data;
		},
	);

	private setVisibility = Fn(([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
		data.w = TSLUtils.packFlag(data.w, 17, value);
		return data;
	});

	private setWindNoise = Fn(([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
		data.w = TSLUtils.packUnit(data.w, 18, 6, value);
		return data;
	});

	private setPositionNoise = Fn(
		([data = float(0), value = float(0)], _builder: NodeBuilder) => {
			return TSLUtils.packUnit(data, 0, 4, value);
		},
	);

	private setShadowFactor = Fn(
		([data = vec4(0), value = float(0)], _builder: NodeBuilder) => {
			data.w = TSLUtils.packFlag(data.w, 16, value);
			return data;
		},
	);

	private setIsFar = Fn(([data = float(0), value = float(0)], _builder: NodeBuilder) => {
		return TSLUtils.packFlag(data, 4, value);
	});

	private computeInit = Fn(() => {
		const data1 = this.buffer1.element(instanceIndex);
		const data2 = this.buffer2.element(instanceIndex);
		// Position XZ
		const row = floor(float(instanceIndex).div(config.BLADES_PER_SIDE));
		const col = float(instanceIndex).mod(config.BLADES_PER_SIDE);
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
			.abs()
			.fract();
		const noise = texture(assetManager.resources.noiseAtlas, _uv);
		const wrapNoise = noise.b.sub(0.5);
		const noiseX = wrapNoise.mul(17).fract();
		const noiseZ = wrapNoise.mul(13).fract();
		data1.x = offsetX.add(noiseX);
		data1.y = offsetZ.add(noiseZ);

		data2.assign(this.setPositionNoise(data2, noise.g));
		// Scale
		const n = noise.b;
		const shaped = n.mul(n);
		const randomScale = remap(
			shaped,
			0,
			1,
			uniforms.uBladeMinScale,
			uniforms.uBladeMaxScale,
		);
		data1.assign(this.setScale(data1, randomScale));
		data1.assign(this.setOriginalScale(data1, randomScale));
	})().compute(config.COUNT, [config.WORKGROUP_SIZE]);

	private computeWind = Fn(
		(
			[prevWindXZ = vec2(0), worldPos = vec3(0), positionNoise = float(0)],
			_builder: NodeBuilder,
		) => {
			const dir = windManager.uDirection.negate();
			const strength = mix(uniforms.uWindStrength, 1.5, windManager.uIntensity);

			// --- gentle per-instance speed jitter (±10 %)
			const speed = uniforms.uWindSpeed.mul(
				positionNoise.remap(0, 1, 0.95, 2.05),
			);

			// base uv + scroll
			const uvBase = worldPos.xz.mul(0.01).mul(uniforms.uvWindScale);
			const scroll = dir.mul(speed).mul(gameTime);

			// sample 1 — main noise
			const uvA = uvBase.add(scroll);
			const nA = texture(assetManager.resources.noiseAtlas, uvA)
				.mul(2.0)
				.sub(1.0);

			// sample 2 — same texture, just different frequency & offset
			const uvB = uvBase.mul(1.37).add(scroll.mul(1.11));
			const nB = texture(assetManager.resources.noiseAtlas, uvB)
				.mul(2.0)
				.sub(1.0);

			// mix them — random per instance + slow time wobble
			const mixRand = fract(sin(positionNoise.mul(12.9898)).mul(78.233));
			const mixTime = sin(gameTime.mul(0.4).add(positionNoise.mul(0.1))).mul(
				0.25,
			);
			const w = clamp(mixRand.add(mixTime), 0.2, 0.8);
			const n = mix(nA, nB, w);

			const baseMag = n.r.mul(strength);
			const gustMag = n.g.mul(strength).mul(0.35);
			const windFactor = baseMag.add(gustMag);

			const target = dir.mul(windFactor);
			const k = mix(0.08, 0.25, abs(n.b)); // smooth damping
			const newWind = prevWindXZ.add(target.sub(prevWindXZ).mul(k));

			return vec3(newWind, windFactor);
		},
	);

	private computeTrailScale = Fn(
		(
			[originalScale = float(0), currentScale = float(0), isStepped = float(0)],
			_builder: NodeBuilder, // isStepped in [0,1]
		) => {
			// Upward relax toward original (no step)
			const up = currentScale.add(
				originalScale.sub(currentScale).mul(uniforms.uTrailGrowthRate),
			);

			// Downward crush toward min (when stepped)
			const down = currentScale.add(
				uniforms.uTrailMinScale.sub(currentScale).mul(uniforms.uKDown),
			);

			// Blend by contact (branchless). If your isStepped is hard 0/1, this still works.
			const blended = mix(up, down, isStepped);

			return blended;
		},
	);

	private computeShadowFactor = Fn(
		([grassWorldPos = vec3(0), playerPos = vec3(0)], _builder: NodeBuilder) => {
			// Baked shadow from lightmap
			const bakedShadow = TSLUtils.getBakedShadowFactor(grassWorldPos.xz);

			// Player shadow with smooth intensity based on height above grass
			const playerBottomY = playerPos.y.sub(uniforms.uPlayerRadius);
			const heightAboveGrass = playerBottomY.sub(grassWorldPos.y);

			const playerShadow = TSLUtils.getPlayerShadowFactor(
				grassWorldPos,
				playerPos,
				uniforms.uPlayerRadius,
				uniforms.uSunDir,
			);

			// With no baked terrain shadow, keep the projected ball shadow strongest
			// at contact and fade it naturally as the ball rises away from the grass.
			const shadowFade = smoothstep(2, 8, heightAboveGrass);
			const effectivePlayerShadow = mix(playerShadow, float(1), shadowFade);
			return step(0.5, bakedShadow).mul(effectivePlayerShadow);
		},
	);

	computeUpdate = Fn(() => {
		const data1 = this.buffer1.element(instanceIndex);
		const data2 = this.buffer2.element(instanceIndex);

		// Position
		const pos = VegetationSsboUtils.wrapPosition(
			vec2(data1.x, data1.y),
			uniforms.uPlayerDeltaXZ,
			config.TILE_SIZE,
		);
		data1.x = pos.x;
		data1.y = pos.z;

		const worldPos = pos.add(uniforms.uPlayerPosition);

		// Visibility
		const stochasticKeep = VegetationSsboUtils.computeStochasticKeep(
			worldPos,
			uniforms.uPlayerPosition,
			uniforms.uR0,
			uniforms.uR1,
			uniforms.uPMin,
		);

		const isVisible = VegetationSsboUtils.computeVisibility(
			worldPos,
			uniforms.uCameraMatrix,
			uniforms.uFx,
			uniforms.uFy,
			config.BLADE_BOUNDING_SPHERE_RADIUS,
			uniforms.uCullPadNDCX,
			uniforms.uCullPadNDCYNear,
			uniforms.uCullPadNDCYFar,
		).mul(stochasticKeep);
		data1.assign(this.setVisibility(data1, isVisible));
		data1.assign(this.setShadowFactor(data1, 1));
		data2.assign(this.setIsFar(data2, 0));

		// Soft culling
		If(isVisible, () => {
			// Alpha
			const alpha = VegetationSsboUtils.computeAlpha(worldPos);
			data1.assign(this.setVisibility(data1, alpha));

			// Y offset
			const yOffset = VegetationSsboUtils.computeYOffset(worldPos);
			data2.assign(this.setYOffset(data2, yOffset));

			// Compute distance to player
			const diff = worldPos.xz.sub(uniforms.uPlayerPosition.xz);
			const distSq = diff.dot(diff);
			data2.assign(this.setIsFar(data2, distSq.lessThan(100).toFloat()));

			// Check if the player is on the ground
			const isPlayerGrounded = step(
				0.1,
				float(1).sub(uniforms.uPlayerPosition.y.sub(yOffset)),
			);

			const inner = uniforms.uTrailRadiusSquared.mul(0.35);
			const outer = uniforms.uTrailRadiusSquared;
			const contact = float(1.0)
				.sub(smoothstep(inner, outer, distSq))
				.mul(isPlayerGrounded);

			// Trail
			const currentScale = this.getScale(data1);
			const originalScale = this.getOriginalScale(data1);
			const newScale = this.computeTrailScale(
				originalScale,
				currentScale,
				contact,
			);
			data1.assign(this.setScale(data1, newScale));

			// Wind
			const positionNoise = this.getPositionNoise(data2);
			const prevWind = this.getWind(data1);
			const newWind = this.computeWind(prevWind, worldPos, positionNoise);
			data1.assign(this.setWind(data1, newWind.xy)); // Wind displacement
			data1.assign(this.setWindNoise(data1, newWind.z)); // Noise factor

			// Shadow factor (baked + player projected)
			const grassWorldPos = vec3(worldPos.x, yOffset, worldPos.z);
			const shadowFactor = this.computeShadowFactor(
				grassWorldPos,
				uniforms.uPlayerPosition,
			);
			data1.assign(this.setShadowFactor(data1, shadowFactor));
		});
	})().compute(config.COUNT, [config.WORKGROUP_SIZE]);
}

class GrassMaterial extends SpriteNodeMaterial {
	private ssbo: GrassSsbo;
	constructor(ssbo: GrassSsbo) {
		super();
		this.ssbo = ssbo;
		this.createGrassMaterial();
	}

	private createGrassMaterial() {
		this.precision = "lowp";
		this.transparent = false;
		this.stencilWrite = false;
		this.forceSinglePass = true;

		// compute values
		const data1 = this.ssbo.computeBuffer1.element(instanceIndex);
		const data2 = this.ssbo.computeBuffer2.element(instanceIndex);
		const offsetX = data1.x;
		const offsetY = this.ssbo.getYOffset(data2);
		const offsetZ = data1.y;
		const windXZ = this.ssbo.getWind(data1);
		const scaleY = this.ssbo.getScale(data1);
		const isVisible = this.ssbo.getVisibility(data1);
		const windNoiseFactor = this.ssbo.getWindNoise(data1);
		const positionNoise = this.ssbo.getPositionNoise(data2);
		const bakedShadowFactor = this.ssbo.getShadowFactor(data1);
		const isFar = this.ssbo.getIsFar(data2);

		// OPACITY
		this.opacityNode = isVisible;

		// SCALE
		const scaleX = positionNoise.remap(0, 1, 0.5, 1.5);
		const bladeScale = vec3(scaleX, scaleY, 1);
		this.scaleNode = mix(vec3(0), bladeScale, isVisible);

		// ROTATION
		const instanceNoise = hash(instanceIndex.add(196.4356)).sub(0.5).mul(0.25);
		const h = uv().y;
		const bendProfile = h.mul(h).mul(uniforms.uBaseBending);
		const baseBending = positionNoise
			.sub(0.5)
			.mul(0.25)
			.add(instanceNoise)
			.mul(bendProfile);
		this.rotationNode = vec3(baseBending, 0, 0);

		// POSITION
		// fragment cull
		const offscreenOffset = uniforms.uCameraForward
			.mul(INFINITY)
			.mul(float(1).sub(isVisible));
		// base offset
		const bladePosition = vec3(offsetX, offsetY, offsetZ);
		// sway effect
		const randomPhase = positionNoise.mul(PI2);
		const swayAmount = sin(gameTime.mul(5).add(randomPhase)).mul(0.15);
		const swayFactor = uv().y.mul(windNoiseFactor);
		const swayOffset = swayAmount.mul(swayFactor);
		// flutter offset
		const dirXZ = windManager.uDirection;
		const perp = vec2(dirXZ.y.negate(), dirXZ.x);
		const phase = hash(instanceIndex).mul(PI2);
		const flutter = sin(
			gameTime.mul(uniforms.uWindSpeed.mul(1.7)).add(phase.mul(1.3)),
		)
			.mul(0.06)
			.mul(bendProfile);
		const flutterOffset = vec3(perp.x, 0.0, perp.y).mul(flutter);
		// wind offset
		const windY = float(1).sub(h.mul(h)).mul(windManager.uIntensity).mul(0.25);
		const windOffset = vec3(windXZ.x, windY, windXZ.y).mul(bendProfile);

		const pos = bladePosition
			.add(offscreenOffset)
			.add(swayOffset)
			.add(flutterOffset)
			.add(windOffset);
		this.positionNode = pos;

		// COLOR + AO
		// ao
		const r2 = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
		const near = float(1).sub(smoothstep(0, uniforms.uAoRadiusSquared, r2));
		const edge = uv().x.mul(2.0).sub(1.0).abs();
		const rim = smoothstep(
			uniforms.uAoRimSmoothness.negate(),
			uniforms.uAoRimSmoothness,
			edge,
		);
		const hWeight = float(1).sub(smoothstep(0.1, 0.85, h));
		const aoStrength = uniforms.uAoScale.mul(0.25);
		const ao = float(1).sub(aoStrength.mul(near.mul(rim).mul(hWeight)));
		// diffuse
		const colorProfile = h.mul(uniforms.uColorMixFactor);
		const jitter = smoothstep(
			0,
			uniforms.uColorVariationStrength,
			positionNoise,
		);
		const baseColorJittered = uniforms.uBaseColor.mul(jitter);
		const baseToTip = mix(baseColorJittered, uniforms.uTipColor, colorProfile);
		const baseMask = float(1).sub(
			smoothstep(0.0, uniforms.uBaseShadeHeight, h),
		);
		const windAo = mix(
			1.0,
			float(1).sub(uniforms.uBaseWindShade),
			baseMask.mul(smoothstep(0.0, 1.0, swayFactor as unknown as ReturnType<typeof float>)),
		);

		// bakedShadowFactor from SSBO now includes player shadow
		const withShadow = mix(baseToTip.mul(0.5), baseToTip, bakedShadowFactor);
		this.colorNode = withShadow.mul(windAo).mul(ao);

		// const normal = vec3(instanceNoise, baseBending, instanceNoise).normalize();
		// const reflectedLight = reflect(uniforms.uSunDir, normal);
		// const viewDir = normalize(cameraPosition.sub(positionWorld));
		// const align = max(dot(reflectedLight, viewDir), 0);
		// const spec = smoothstep(
		//   0,
		//   1,
		//   align.mul(float(1).sub(uv().y)).mul(3).add(0.4),
		// );
		// this.colorNode = baseToTip.mul(windAo).mul(ao).mul(spec);
	}
}

class GrassSystem {
	private isComputeInFlight = false;
	private ssbo: GrassSsbo;
	private grass: InstancedMesh;

	constructor() {
		uniforms.uSunDir.value.copy(lightingManager.sunDirection);
		this.ssbo = new GrassSsbo();
		const geometry = this.createGeometry(config.SEGMENTS);
		this.grass = new InstancedMesh(geometry, new GrassMaterial(this.ssbo), config.COUNT);
		this.grass.frustumCulled = false;
		sceneManager.scene.add(this.grass);

		this.debugGrass();
	}

	update(playerPosition: Vector3, playerRadius: number) {
		uniforms.uPlayerDeltaXZ.value.set(
			playerPosition.x - this.grass.position.x,
			playerPosition.z - this.grass.position.z,
		);
		uniforms.uPlayerPosition.value.copy(playerPosition);
		uniforms.uPlayerRadius.value = playerRadius;
		const projection = sceneManager.playerCamera.projectionMatrix;
		uniforms.uFx.value = projection.elements[0];
		uniforms.uFy.value = projection.elements[5];
		uniforms.uCameraMatrix.value
			.copy(projection)
			.multiply(sceneManager.playerCamera.matrixWorldInverse);
		sceneManager.playerCamera.getWorldDirection(uniforms.uCameraForward.value);
		this.grass.position.copy(playerPosition).setY(0);
		if (this.isComputeInFlight) return;
		this.isComputeInFlight = true;
		rendererManager.renderer
			.computeAsync(this.ssbo.computeUpdate)
			.catch((error) => console.error("[Grass] computeAsync failed:", error))
			.finally(() => { this.isComputeInFlight = false; });
	}

	private debugGrass() {
		const folder = debugManager.panel.addFolder({
			title: "🌱 Grass",
			expanded: false,
		});

		const color = folder.addFolder({ title: "Color" });
		color.addBinding(uniforms.uTipColor, "value", {
			label: "Tip",
			view: "color",
			color: { type: "float" },
		});
		color.addBinding(uniforms.uBaseColor, "value", {
			label: "Base",
			view: "color",
			color: { type: "float" },
		});
		color.addBinding(uniforms.uColorMixFactor, "value", {
			label: "Mix factor",
			min: 0,
			max: 1,
			step: 0.01,
		});
		color.addBinding(uniforms.uColorVariationStrength, "value", {
			label: "Variation strength",
			min: 0,
			max: 3,
			step: 0.01,
		});
		color.addBinding(uniforms.uWindColorStrength, "value", {
			label: "Wind color strength",
			min: 0,
			max: 1,
			step: 0.01,
		});

		color.addBinding(uniforms.uBaseWindShade, "value", {
			label: "Wind shade strength",
			min: 0,
			max: 2,
			step: 0.01,
		});
		color.addBinding(uniforms.uBaseShadeHeight, "value", {
			label: "Wind shade height",
			min: 0,
			max: 10,
			step: 0.01,
		});
		color.addBinding(uniforms.uAoScale, "value", {
			label: "AO scale",
			min: 0,
			max: 5,
			step: 0.01,
		});
		color.addBinding(uniforms.uAoRimSmoothness, "value", {
			label: "AO rim smoothness",
			min: 0,
			max: 5,
			step: 0.01,
		});
		color
			.addBinding(uniforms.uAoRadius, "value", {
				label: "AO radius",
				min: 0,
				max: 100,
				step: 0.01,
			})
			.on("change", ({ value }: { value: number }) => {
				uniforms.uAoRadiusSquared.value = value * value;
			});

		const wind = folder.addFolder({ title: "Wind" });
		wind.addBinding(uniforms.uWindStrength, "value", {
			label: "Strength",
			min: 0,
			max: Math.PI,
			step: 0.01,
		});
		wind.addBinding(uniforms.uWindSpeed, "value", {
			label: "Speed",
			min: 0,
			max: 1,
			step: 0.01,
		});
		wind.addBinding(uniforms.uvWindScale, "value", {
			label: "UV scale",
			step: 0.01,
			min: 0,
			max: 10,
		});

		const stochastic = folder.addFolder({ title: "Stochastic keep" });
		stochastic.addBinding(uniforms.uR0, "value", {
			label: "Inner ring",
			min: 0,
			max: config.TILE_SIZE,
			step: 0.1,
		});
		stochastic.addBinding(uniforms.uR1, "value", {
			label: "Outer ring",
			min: 0,
			max: config.TILE_SIZE,
			step: 0.1,
		});
		stochastic.addBinding(uniforms.uPMin, "value", {
			label: "P Min",
			min: 0,
			max: 1,
			step: 0.01,
		});

		const trail = folder.addFolder({ title: "Trail" });
		trail.addBinding(uniforms.uTrailGrowthRate, "value", {
			label: "Growth rate",
			min: 0,
			max: 0.1,
			step: 0.001,
		});
		trail.addBinding(uniforms.uTrailMinScale, "value", {
			label: "Min scale",
			min: 0,
			max: 1,
			step: 0.01,
		});
		trail.addBinding(uniforms.uKDown, "value", {
			label: "Crushing speed",
			min: 0,
			max: 5,
			step: 0.01,
		});
		trail
			.addBinding(uniforms.uTrailRadius, "value", {
				label: "Trail radius",
				min: 0,
				max: 2,
				step: 0.01,
			})
			.on("change", ({ value }: { value: number }) => {
				uniforms.uTrailRadiusSquared.value = value * value;
			});

		const general = folder.addFolder({ title: "General" });
		general.addBinding(uniforms.uBaseBending, "value", {
			label: "Base bend",
			min: -Math.PI * 2,
			max: Math.PI * 2,
			step: 0.01,
		});
		general.addBinding(uniforms.uBladeMinScale, "value", {
			label: "Min scale",
			min: 0,
			max: 5,
			step: 0.01,
		});
		general.addBinding(uniforms.uBladeMaxScale, "value", {
			label: "Max scale",
			min: 0,
			max: 5,
			step: 0.01,
		});
		general.addBinding(uniforms.uCullPadNDCX, "value", {
			label: "Cull pad X",
			min: 0,
			max: 0.5,
			step: 0.001,
		});
		general.addBinding(uniforms.uCullPadNDCYNear, "value", {
			label: "Cull pad Y (near)",
			min: 0,
			max: 1,
			step: 0.001,
		});
		general.addBinding(uniforms.uCullPadNDCYFar, "value", {
			label: "Cull pad Y (far)",
			min: 0,
			max: 1,
			step: 0.001,
		});
	}

	private createGeometry(nSegments: number) {
		const segments = Math.max(1, Math.floor(nSegments)); // total vertical slices
		const height = config.BLADE_HEIGHT;
		const halfWidthBase = config.BLADE_WIDTH * 0.5;

		// We have `segments` rows of (L,R) vertices, then a single tip vertex.
		const rowCount = segments; // #pair-rows
		const vertexCount = rowCount * 2 + 1; // 2 per row + tip
		const quadCount = Math.max(0, rowCount - 1); // quads between consecutive rows
		const indexCount = quadCount * 6 + 3; // 6 per quad + 3 for tip

		const positions = new Float32Array(vertexCount * 3);
		const uvs = new Float32Array(vertexCount * 2);
		// WebGPU in three@0.184 only accepts uint16/uint32 index buffers.
		// Values are unchanged from upstream; only the transport width differs.
		const indices = new Uint16Array(indexCount);
		const normals = new Float32Array(vertexCount * 3);

		// simple taper: ~linear → narrower toward tip; tweak as you like
		const taper = (t: number) => halfWidthBase * (1.0 - 0.7 * t); // t in [0..1]

		// build rows
		let idx = 0; // write cursor for indices
		for (let row = 0; row < rowCount; row++) {
			const v = row / segments; // normalized height [0..(segments-1)/segments]
			const y = v * height;
			const halfWidth = taper(v);

			const left = row * 2;
			const right = left + 1;

			// positions
			positions[3 * left + 0] = -halfWidth;
			positions[3 * left + 1] = y;
			positions[3 * left + 2] = 0;

			positions[3 * right + 0] = halfWidth;
			positions[3 * right + 1] = y;
			positions[3 * right + 2] = 0;

			// uvs (L=0, R=1; V along height)
			uvs[2 * left + 0] = 0.0;
			uvs[2 * left + 1] = v;
			uvs[2 * right + 0] = 1.0;
			uvs[2 * right + 1] = v;

			// make a quad with the previous row (except for the very first row)
			if (row > 0) {
				const prevLeft = (row - 1) * 2;
				const prevRight = prevLeft + 1;

				// (prevL, prevR, currR) and (prevL, currR, currL)
				indices[idx++] = prevLeft;
				indices[idx++] = prevRight;
				indices[idx++] = right;

				indices[idx++] = prevLeft;
				indices[idx++] = right;
				indices[idx++] = left;
			}
		}

		// tip vertex at full height
		const tip = rowCount * 2;
		positions[3 * tip + 0] = 0;
		positions[3 * tip + 1] = height;
		positions[3 * tip + 2] = 0;
		uvs[2 * tip + 0] = 0.5;
		uvs[2 * tip + 1] = 1.0;

		// connect last row to tip (single triangle)
		const lastLeft = (rowCount - 1) * 2;
		const lastRight = lastLeft + 1;
		indices[idx++] = lastLeft;
		indices[idx++] = lastRight;
		indices[idx++] = tip;

		// assemble geometry
		const geom = new BufferGeometry();

		const posAttribute = new BufferAttribute(positions, 3);
		posAttribute.setUsage(StaticDrawUsage);
		geom.setAttribute("position", posAttribute);

		const uvAttribute = new BufferAttribute(uvs, 2);
		uvAttribute.setUsage(StaticDrawUsage);
		geom.setAttribute("uv", uvAttribute);

		const indexAttribute = new BufferAttribute(indices, 1);
		indexAttribute.setUsage(StaticDrawUsage);
		geom.setIndex(indexAttribute);

		const normalAttribute = new BufferAttribute(normals, 3);
		normalAttribute.setUsage(StaticDrawUsage);
		geom.setAttribute("normal", normalAttribute);

		return geom;
	}
}

function smoothstep01(value: number) {
	const t = Math.max(0, Math.min(1, value));
	return t * t * (3 - 2 * t);
}

export function grassMaskAtHeight(
	height: number,
	waterLevel: number,
	shoreClearance: number,
	transitionWidth: number,
) {
	if (transitionWidth <= 0) return height >= waterLevel + shoreClearance ? 1 : 0;
	return smoothstep01((height - (waterLevel + shoreClearance)) / transitionWidth);
}

export default function Grass({
	heightAt,
	waterLevel,
	mapSize,
	shoreClearance,
	transitionWidth,
}: {
	heightAt: (x: number, z: number) => number;
	waterLevel: number;
	mapSize: number;
	shoreClearance: number;
	transitionWidth: number;
}) {
	const { scene, camera, gl } = useThree();
	const runtime = usePlayerRuntime();
	const noiseAtlas = useTexture(withBasePath("/grassworld/textures/noise-atlas.png"));
	const systemRef = useRef<GrassSystem | null>(null);
	const updateFrame = useRef(0);

	const heightmap = useMemo(() => {
		const values = new Float32Array(mapSize * mapSize);
		let max = -Infinity;
		for (let z = 0; z < mapSize; z += 1) {
			for (let x = 0; x < mapSize; x += 1) {
				const height = heightAt(x - mapSize / 2, z - mapSize / 2);
				values[x + z * mapSize] = height;
				max = Math.max(max, height);
			}
		}
		const result = new DataTexture(values, mapSize, mapSize, RedFormat, FloatType);
		result.minFilter = result.magFilter = LinearFilter;
		result.needsUpdate = true;
		result.userData.max = max;
		return result;
	}, [heightAt, mapSize]);

	const grassMap = useMemo(() => {
		const values = new Uint8Array(mapSize * mapSize * 4);
		const heights = heightmap.image.data as Float32Array;
		for (let row = 0; row < mapSize; row += 1) {
			for (let x = 0; x < mapSize; x += 1) {
				const height = row === 0
					? heightAt(x - mapSize / 2, mapSize / 2)
					: heights[x + (mapSize - row) * mapSize];
				const grass = Math.round(255 * grassMaskAtHeight(
					height,
					waterLevel,
					shoreClearance,
					transitionWidth,
				));
				const index = (x + row * mapSize) * 4;
				values[index] = values[index + 1] = values[index + 2] = grass;
				values[index + 3] = 255;
			}
		}
		const result = new DataTexture(values, mapSize, mapSize, RGBAFormat, UnsignedByteType);
		result.minFilter = result.magFilter = LinearFilter;
		result.needsUpdate = true;
		return result;
	}, [heightAt, heightmap, mapSize, shoreClearance, transitionWidth, waterLevel]);

	useMemo(() => {
		noiseAtlas.wrapS = noiseAtlas.wrapT = RepeatWrapping;
	}, [noiseAtlas]);

	useEffect(() => {
		configureRuntime({
			scene,
			camera: camera as PerspectiveCamera,
			renderer: gl as unknown as WebGPURenderer,
			mapSize,
			resources: { noiseAtlas, grassMap, heightmap },
		});
		const previousChildren = new Set(scene.children);
		const system = new GrassSystem();
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
			grassMap.dispose();
			heightmap.dispose();
		};
	}, [camera, gl, grassMap, heightmap, mapSize, noiseAtlas, scene]);

	useFrame(() => {
		updateFrame.current += 1;
		if (updateFrame.current < 2) return;
		systemRef.current?.update(runtime.current.position, 0.5);
		updateFrame.current = 0;
	}, -5);

	return null;
}
