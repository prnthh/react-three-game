import { useLayoutEffect, useMemo } from "react";
import { Color, FrontSide, Vector3, type Texture } from "three";
import { MeshStandardNodeMaterial, type Node } from "three/webgpu";
import {
    cameraPosition,
    min,
    modelWorldMatrixInverse,
    positionGeometry,
    texture,
    uniform,
    varying,
    vec2,
    vec3,
    vec4,
} from "three/tsl";
import {
    MESH_INSTANCING_MATERIAL_FACTORY,
    useInvalidateMeshInstances,
    useTextureAsset,
    type Component,
    type ComponentViewProps,
    type MeshInstancingMaterialFactory,
} from "react-three-game";
import {
    ColorField,
    FieldGroup,
    Label,
    TexturePicker,
    Vector3Field,
    useEditorRef,
    type ComponentEditorProps,
} from "react-three-game/editor";
import { withBasePath } from "../basePath";

export type InteriorMapProperties = {
    attach?: string;
    texture?: string;
    roomSize?: [number, number, number];
    color?: string;
};

const DEFAULT_TEXTURE = "/textures/interiors/cubemap-faces2.webp";
type MaterialCacheEntry = {
    material: MeshStandardNodeMaterial;
    references: number;
};

const materialCache = new Map<string, MaterialCacheEntry>();

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
    const atlasUv = faceUv.add(vec2(column, row)).mul(vec2(1 / 3, 1 / 2));
    return texture(atlas, atlasUv).rgb.mul(uniform(new Color(tint)));
}

function getMaterialEntry(signature: string) {
    const cached = materialCache.get(signature);
    if (cached) return cached;
    const material = new MeshStandardNodeMaterial({ color: "#000000", side: FrontSide, toneMapped: false });
    material.name = "DemoInteriorMap";
    const entry = { material, references: 0 };
    materialCache.set(signature, entry);
    return entry;
}

function useInteriorMapMaterial(
    atlas: Texture | null,
    texturePath: string,
    roomSize: [number, number, number],
    tint: string,
) {
    const invalidateMeshInstances = useInvalidateMeshInstances();
    const width = Math.max(0.001, roomSize[0]);
    const height = Math.max(0.001, roomSize[1]);
    const depth = Math.max(0.001, roomSize[2]);
    const tintKey = useMemo(() => new Color(tint).getHexString(), [tint]);
    const signature = `${texturePath}:${width}:${height}:${depth}:${tintKey}`;
    const entry = useMemo(() => getMaterialEntry(signature), [signature]);
    const material = entry.material;

    useLayoutEffect(() => {
        entry.references += 1;
        return () => {
            entry.references -= 1;
            queueMicrotask(() => {
                if (entry.references > 0 || materialCache.get(signature) !== entry) return;
                materialCache.delete(signature);
                entry.material.dispose();
            });
        };
    }, [entry, signature]);

    useLayoutEffect(() => {
        if (!atlas || material.userData.interiorAtlas === atlas.uuid) return;
        material.color.set("#ffffff");
        material.colorNode = createInteriorMapNode(atlas, [width, height, depth], `#${tintKey}`);
        material.toneMapped = true;
        material.userData.interiorAtlas = atlas.uuid;
        const createInstancedMaterial: MeshInstancingMaterialFactory = inverseInstanceMatrix => {
            const instanceMaterial = material.clone();
            instanceMaterial.colorNode = createInteriorMapNode(
                atlas,
                [width, height, depth],
                `#${tintKey}`,
                inverseInstanceMatrix,
            );
            instanceMaterial.needsUpdate = true;
            return instanceMaterial;
        };
        material.userData[MESH_INSTANCING_MATERIAL_FACTORY] = createInstancedMaterial;
        material.needsUpdate = true;
        invalidateMeshInstances();
    }, [atlas, depth, height, invalidateMeshInstances, material, tintKey, width]);

    return material;
}

function InteriorMapView({ properties, children }: ComponentViewProps<InteriorMapProperties>) {
    const texturePath = withBasePath(properties.texture ?? DEFAULT_TEXTURE);
    const atlas = useTextureAsset(texturePath);
    const roomSize = properties.roomSize ?? [1, 1, 2.5];
    const material = useInteriorMapMaterial(atlas, texturePath, roomSize, properties.color ?? "#ffffff");
    return <>
        <primitive object={material} attach={properties.attach ?? "material"} dispose={null} />
        {children}
    </>;
}

function InteriorMapEditor({ properties, update }: ComponentEditorProps<InteriorMapProperties>) {
    const { basePath } = useEditorRef();
    return <FieldGroup>
        <div>
            <Label>Cube Faces Atlas</Label>
            <TexturePicker
                value={properties.texture ?? DEFAULT_TEXTURE}
                onChange={value => update({ texture: value })}
                basePath={basePath}
            />
        </div>
        <Vector3Field
            name="roomSize"
            label="Room Size"
            values={properties}
            onChange={update}
            fallback={[1, 1, 2.5]}
        />
        <ColorField
            name="color"
            label="Tint"
            values={properties}
            onChange={update}
            fallback="#ffffff"
        />
    </FieldGroup>;
}

const InteriorMapComponent: Component<InteriorMapProperties> = {
    name: "InteriorMap",
    renderWhenDisabled: true,
    attachment: true,
    attach: "material",
    Editor: InteriorMapEditor,
    View: InteriorMapView,
    properties: {
        attach: { type: "string", default: "material" },
        texture: { type: "string", default: DEFAULT_TEXTURE },
        roomSize: { type: "vector3", default: [1, 1, 2.5] },
        color: { type: "color", default: "#ffffff" },
    },
};

export default InteriorMapComponent;
