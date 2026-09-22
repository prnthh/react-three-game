import { useLayoutEffect, useMemo } from "react";

import { Color, FrontSide, Vector3, type Texture } from "three";

import { MeshBasicNodeMaterial, type Node } from "three/webgpu";

import { cameraPosition, min, modelWorldMatrixInverse, positionGeometry, texture, uniform, varying, vec2, vec3, vec4 } from "three/tsl";

import { MESH_INSTANCING_MATERIAL_FACTORY, useInvalidateMeshInstances, useTextureAsset, useSharedMaterialResource, usePrefab, type Component, type ComponentViewProps, type MeshInstancingMaterialFactory } from "react-three-game/viewer";

import { resolveAssetPath as withBasePath } from "react-three-game/viewer";

export type InteriorMapProperties = {
    attach?: string;
    texture?: string;
    roomSize?: [number, number, number];
    color?: string;
};

export const DEFAULT_TEXTURE = "/textures/interiors/room-atlas.webp";

function createInteriorMapNode(
    atlas: Parameters<typeof texture>[0],
    roomSize: [number, number, number],
    tint = "#ffffff",
    inverseInstanceMatrix?: Node<"mat4">,
) {
    const size = uniform(new Vector3(
        Math.max(0.001, roomSize[0]),
        Math.max(0.001, roomSize[1]),
        Math.max(0.001, roomSize[2]),
    ));
    const cameraInBatch = modelWorldMatrixInverse.mul(vec4(cameraPosition, 1));
    const cameraInRoom = inverseInstanceMatrix
        ? inverseInstanceMatrix.mul(cameraInBatch)
        : cameraInBatch;
    const rayOrigin = varying(cameraInRoom.xyz, "interiorRayOrigin");
    const rayDirection = varying(positionGeometry.sub(rayOrigin), "interiorRayDirection");
    const halfWidth = size.x.mul(0.5);
    const halfHeight = size.y.mul(0.5);
    const boxMin = vec3(halfWidth.negate(), halfHeight.negate(), size.z.negate());
    const boxMax = vec3(halfWidth, halfHeight, 0);
    const farBoundary = vec3(
        rayDirection.x.greaterThanEqual(0).select(boxMax.x, boxMin.x),
        rayDirection.y.greaterThanEqual(0).select(boxMax.y, boxMin.y),
        rayDirection.z.greaterThanEqual(0).select(boxMax.z, boxMin.z),
    );
    const farHit = farBoundary.sub(rayOrigin).div(rayDirection);
    const tx = farHit.x;
    const ty = farHit.y;
    const tz = farHit.z;
    const distance = min(tx, min(ty, tz));
    const hit = rayOrigin.add(rayDirection.mul(distance));
    const horizontal = hit.x.div(size.x).add(0.5);
    const vertical = hit.y.div(size.y).add(0.5);
    const intoRoom = hit.z.negate().div(size.z);
    const positiveX = hit.x.greaterThanEqual(0);
    const positiveY = hit.y.greaterThanEqual(0);
    const positiveZ = hit.z.greaterThanEqual(0);
    const xUv = vec2(positiveX.select(intoRoom, intoRoom.oneMinus()), vertical);
    const yUv = vec2(horizontal, positiveY.select(intoRoom, intoRoom.oneMinus()));
    const zUv = vec2(positiveZ.select(horizontal, horizontal.oneMinus()), vertical);
    const isXFace = tx.lessThanEqual(ty).and(tx.lessThanEqual(tz));
    const isYFace = ty.lessThanEqual(tx).and(ty.lessThanEqual(tz));
    const faceUv = isXFace.select(xUv, isYFace.select(yUv, zUv));
    const column = isXFace.select(0, isYFace.select(1, 2));
    const positiveFace = isXFace.select(positiveX, isYFace.select(positiveY, positiveZ));
    const row = positiveFace.select(1, 0);
    const atlasUv = faceUv.clamp(0.002, 0.998).add(vec2(column, row)).mul(vec2(1 / 3, 1 / 2));
    return texture(atlas, atlasUv).rgb.mul(uniform(new Color(tint)));
}

function useInteriorMapMaterial(atlas: Texture | null, texturePath: string, roomSize: [number, number, number], tint: string) {
    const invalidate = useInvalidateMeshInstances();
    const width = Math.max(0.001, roomSize[0]);
    const height = Math.max(0.001, roomSize[1]);
    const depth = Math.max(0.001, roomSize[2]);
    const tintKey = useMemo(() => new Color(tint).getHexString(), [tint]);
    const signature = `interior:${texturePath}:${atlas?.uuid ?? 'pending'}:${width}:${height}:${depth}:${tintKey}`;
    const material = useSharedMaterialResource(signature, () => {
        const result = new MeshBasicNodeMaterial({ color: atlas ? '#ffffff' : '#000000', side: FrontSide, toneMapped: !!atlas });
        result.name = 'DemoInteriorMap';
        if (atlas) {
            result.colorNode = createInteriorMapNode(atlas, [width, height, depth], `#${tintKey}`);
            const factory: MeshInstancingMaterialFactory = inverseInstanceMatrix => {
                const instanced = result.clone();
                instanced.colorNode = createInteriorMapNode(atlas, [width, height, depth], `#${tintKey}`, inverseInstanceMatrix);
                return instanced;
            };
            result.userData[MESH_INSTANCING_MATERIAL_FACTORY] = factory;
        }
        return result;
    });
    useLayoutEffect(() => invalidate(), [invalidate, material]);
    return material;
}

function InteriorMapView({ properties, children }: ComponentViewProps<InteriorMapProperties>) {
    const { basePath } = usePrefab();
    const texturePath = withBasePath(basePath, properties.texture ?? DEFAULT_TEXTURE);
    const atlas = useTextureAsset(texturePath);
    const roomSize = properties.roomSize ?? [1, 1, 2.5];
    const material = useInteriorMapMaterial(atlas, texturePath, roomSize, properties.color ?? "#ffffff");
    return <>
        <primitive key={material.uuid} object={material} attach={properties.attach ?? "material"} dispose={null} />
        {children}
    </>;
}

const InteriorMapComponent: Component<InteriorMapProperties> = {
    name: "InteriorMap",
    dependencies: properties => [{ kind: "texture", path: properties.texture ?? DEFAULT_TEXTURE }],
    renderWhenDisabled: true,
    slot: "material",
    View: InteriorMapView,
    properties: {
        attach: { type: "string", default: "material" },
        texture: { type: "string", default: DEFAULT_TEXTURE },
        roomSize: { type: "vector3", default: [1, 1, 2.5] },
        color: { type: "color", default: "#ffffff" },
    },
};

export default InteriorMapComponent;
