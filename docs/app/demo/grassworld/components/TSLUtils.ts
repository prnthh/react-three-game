import {
	Fn as typedFn,
	hash,
	instanceIndex,
	mat4,
	mix,
	vec2,
	float,
	pow,
	floor,
	mod,
	sub,
	clamp,
	max,
	round,
	step,
	texture,
	vec3,
	vec4,
	int,
	EPSILON,
	smoothstep,
} from "three/tsl";
import type { NodeBuilder } from "three/webgpu";

const Fn: any = typedFn;
import { assetManager, worldConfig } from "./GrassWorldRuntime";

export class TSLUtils {
	/**
	 * @description Packs into [offset, bits] using fixed-point (lsb, bias)
	 * @param dest [float] destination data
	 * @param offset [int] location of starting bit index
	 * @param bits [int] how many bits it should occupy
	 * @param value [float] value to be stored
	 * @param lsb [float]
	 * @param bias [float]
	 */
	private static packF32 = Fn(
		(
			[
				dest = float(0),
				offset = int(0),
				bits = int(8),
				value = float(0),
				lsb = float(1),
				bias = float(0),
			],
			_builder: NodeBuilder,
		) => {
			const levels = sub(pow(2, bits.toFloat()), 1);
			const qRaw = sub(value, bias).div(max(lsb, EPSILON));
			const q = clamp(round(qRaw), 0, levels);

			const base = pow(2, offset.toFloat()); // 2^offset
			const span = pow(2, bits.toFloat()); // 2^bits
			const slot = floor(dest.div(base));
			const old = mod(slot, span).mul(base); // old field value * base

			// remove old field, add new field
			return dest.sub(old).add(q.mul(base));
		},
	);

	/**
	 * @description Unpacks from [offset, bits] with (lsb, bias)
	 * @param src [float] source data
	 * @param offset [int] location of starting bit index
	 * @param bits [int] how many bits it occupies
	 * @param lsb [float]
	 * @param bias [float]
	 */
	private static unpackF32 = Fn(
		(
			[
				src = float(0),
				offset = int(0),
				bits = int(8),
				lsb = float(1),
				bias = float(0),
			],
			_builder: NodeBuilder,
		) => {
			const base = pow(2, offset.toFloat());
			const span = pow(2, bits.toFloat());
			const slot = floor(src.div(base));
			const q = mod(slot, span);
			return q.mul(lsb).add(bias);
		},
	);

	/**
	 * @description Packs a value with a range 0..1
	 * @param dest [float] destination data
	 * @param offset [int] location of starting bit index
	 * @param bits [int] how many bits it should occupy
	 * @param value [float] value to be stored (in range 0..1)
	 */
	static packUnit = Fn(
		(
			[dest = float(0), offset = int(0), bits = int(8), value = float(0)],
			_builder: NodeBuilder,
		) => {
			const lsb = float(1).div(sub(pow(2, bits.toFloat()), 1)); // 1/(2^bits-1)
			return this.packF32(dest, offset, bits, value, lsb, float(0));
		},
	);

	/**
	 * @description Unpacks a value with a range 0..1
	 * @param src [float] source data
	 * @param offset [int] location of starting bit index
	 * @param bits [int] how many bits it occupies
	 */
	static unpackUnit = Fn(
		([src = float(0), offset = int(0), bits = int(8)], _builder: NodeBuilder) => {
			const lsb = float(1).div(sub(pow(2, bits.toFloat()), 1));
			return this.unpackF32(src, offset, bits, lsb, float(0));
		},
	);

	/**
	 * @description Packs a binary value that is either 0 or 1
	 * @param dest [float] destination data
	 * @param offset [int] location of starting bit index
	 * @param value [float] flag to be stored, binary 0/1
	 */
	static packFlag = Fn(
		([dest = float(0), offset = int(0), value = float(0)], _builder: NodeBuilder) =>
			this.packF32(dest, offset, int(1), value, float(1), float(0)),
	);

	/**
	 * @description Unpacks a binary value that is either 0 or 1
	 * @param src [float] source data
	 * @param offset [int] location of starting bit index
	 */
	static unpackFlag = Fn(([src = float(0), offset = int(0)], _builder: NodeBuilder) =>
		this.unpackF32(src, offset, int(1), float(1), float(0)),
	);

	/**
	 * @description Packs a value with a range min..max both ends included
	 * @param dest [float] destination data
	 * @param offset [int] location of starting bit index
	 * @param bits [int] how many bits it should occupy
	 * @param value [float] value to be stored (in range 0..1)
	 * @param minV [float] min (included)
	 * @param maxV [float] max (included)
	 */
	static packUnits = Fn(
		(
			[
				dest = float(0),
				offset = int(0),
				bits = int(8),
				value = float(0),
				minV = float(0),
				maxV = float(1),
			],
			_builder: NodeBuilder,
		) => {
			const levels = sub(pow(2, bits.toFloat()), 1);
			const lsb = maxV.sub(minV).div(levels);
			return this.packF32(dest, offset, bits, value, lsb, minV);
		},
	);

	/**
	 * @description Unpacks a value with a range min..max both ends included
	 * @param src [float] source data
	 * @param offset [int] location of starting bit index
	 * @param bits [int] how many bits it occupies
	 * @param minV [float] min (included)
	 * @param maxV [float] max (included)
	 */
	static unpackUnits = Fn(
		(
			[
				src = float(0),
				offset = int(0),
				bits = int(8),
				minV = float(0),
				maxV = float(1),
			],
			_builder: NodeBuilder,
		) => {
			const lsb = maxV.sub(minV).div(sub(pow(2, bits.toFloat()), 1));
			return this.unpackF32(src, offset, bits, lsb, minV);
		},
	);

	static computeMapUvByPosition = Fn(([pos = vec2(0)], _builder: NodeBuilder) => {
		return pos.add(worldConfig.halfMapSize).div(worldConfig.mapSize);
	});

	static getBakedShadowFactor = Fn(([_worldPosXZ = vec2(0)], _builder: NodeBuilder) => {
		// The source map was baked for a different authored terrain. Procedural
		// Grass World starts fully lit and keeps the dynamic player shadow below.
		return float(1);
	});

	static getPlayerShadowFactor = Fn(
		(
			[
				worldPos = vec3(0),
				playerPos = vec3(0),
				playerRadius = float(0.5),
				sunDir = vec3(0),
			],
			_builder: NodeBuilder,
		) => {
			// sunDir points FROM sun TO scene (e.g., normalized(-1,-1,-1))
			// Find where player center projects onto plane at worldPos.y along sunDir
			// playerPos + sunDir * t = shadowPoint, where shadowPoint.y = worldPos.y
			// t = (worldPos.y - playerPos.y) / sunDir.y
			const t = worldPos.y.sub(playerPos.y).div(sunDir.y.add(EPSILON));

			// Shadow center XZ at grass height
			const shadowX = playerPos.x.add(sunDir.x.mul(t));
			const shadowZ = playerPos.z.add(sunDir.z.mul(t));

			// Squared distance from grass to shadow center (XZ plane)
			const dx = worldPos.x.sub(shadowX);
			const dz = worldPos.z.sub(shadowZ);
			const distSq = dx.mul(dx).add(dz.mul(dz));

			// Soft shadow: 0 = full shadow, 1 = lit
			const rSq = playerRadius.mul(playerRadius);
			return smoothstep(rSq.mul(0.5), rSq.mul(2.0), distSq);
		},
	);

}

export class VegetationSsboUtils {
	static computeStochasticKeep = Fn(
		(
			[
				worldPos = vec3(0),
				playerPosition = vec3(0),
				R0 = float(0),
				R1 = float(0),
				pMin = float(0),
			],
			_builder: NodeBuilder,
		) => {
			const dx = worldPos.x.sub(playerPosition.x);
			const dz = worldPos.z.sub(playerPosition.z);
			const distSq = dx.mul(dx).add(dz.mul(dz));
			const R0Sq = R0.mul(R0);
			const R1Sq = R1.mul(R1);
			const t = distSq
				.sub(R0Sq)
				.div(max(R1Sq.sub(R0Sq), EPSILON))
				.clamp();
			const probability = mix(1, pMin, t);
			const random = hash(float(instanceIndex).mul(0.73));
			return step(random, probability);
		},
	);

	static computeVisibility = Fn(
		(
			[
				worldPos = vec3(0),
				cameraMatrix = mat4(),
				fX = float(0),
				fY = float(0),
				radius = float(0),
				padNdcX = float(0),
				padNdcYNear = float(0),
				padNdcYFar = float(0),
			],
			_builder: NodeBuilder,
		) => {
			const one = float(1);
			const clip = cameraMatrix.mul(vec4(worldPos, 1));
			const ndc = clip.xyz.mul(one.div(clip.w));
			const eyeDepth = clip.w.abs().max(EPSILON);
			const radiusX = fX.mul(radius).div(eyeDepth).add(padNdcX);
			const radiusY = fY.mul(radius).div(eyeDepth);
			const visibleX = step(one.negate().sub(radiusX), ndc.x)
				.mul(step(ndc.x, one.add(radiusX)));
			const visibleY = step(one.negate().sub(radiusY.add(padNdcYNear)), ndc.y)
				.mul(step(ndc.y.add(radiusY.sub(padNdcYFar)), one));
			const visibleZ = step(-1, ndc.z).mul(step(ndc.z, 1));
			return visibleX.mul(visibleY).mul(visibleZ);
		},
	);

	static computeAlpha = Fn(([worldPos = vec3(0)], _builder: NodeBuilder) => {
		const uv = TSLUtils.computeMapUvByPosition(worldPos.xz);
		return step(0.25, texture(assetManager.resources.grassMap, uv).g);
	});

	static computeYOffset = Fn(([worldPos = vec3(0)], _builder: NodeBuilder) => {
		const uv = TSLUtils.computeMapUvByPosition(worldPos.xz);
		const fixedUv = vec2(uv.x, float(1).sub(uv.y));
		return texture(assetManager.resources.heightmap, fixedUv).r;
	});

	static wrapPosition = Fn(
		(
			[posXZ = vec2(0), playerDeltaXZ = vec2(0), tileSize = float(0)],
			_builder: NodeBuilder,
		) => {
			const halfTile = tileSize.div(2);
			const x = mod(posXZ.x.sub(playerDeltaXZ.x).add(halfTile), tileSize).sub(halfTile);
			const z = mod(posXZ.y.sub(playerDeltaXZ.y).add(halfTile), tileSize).sub(halfTile);
			return vec3(x, 0, z);
		},
	);
}
