import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Color, FrontSide, Vector3, type Texture } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
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
} from 'three/tsl';
import type { Component, ComponentEditorProps, ComponentViewProps } from './ComponentRegistry';
import { ColorField, FieldGroup, Label, Vector3Field } from './Input';
import { TexturePicker } from '../../assetviewer/page';
import { useEditorRef } from '../EditorContext';
import { usePrefab } from '../SceneContext';
import { withBasePath } from '../runtimeUtils';
import { useTextureAsset } from '../assetRuntime';

export type InteriorMapProperties = {
    /** R3F property on the enclosing object that receives this material. */
    attach?: string;
    texture?: string;
    roomSize?: [number, number, number];
    color?: string;
};

const DEFAULT_TEXTURE = '/textures/interiors/cubemap-faces2.webp';

/**
 * Builds a camera-correct interior cube ray in object space. The atlas layout is:
 * +X +Y +Z
 * -X -Y -Z
 */
export function createInteriorMapNode(
    atlas: Parameters<typeof texture>[0],
    roomSize: [number, number, number],
    tint = '#ffffff',
) {
    const size = uniform(new Vector3(
        Math.max(0.001, roomSize[0]),
        Math.max(0.001, roomSize[1]),
        Math.max(0.001, roomSize[2]),
    ));
    const rayOrigin = varying(
        modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz,
        'interiorRayOrigin',
    );
    const rayDirection = varying(positionGeometry.sub(rayOrigin), 'interiorRayDirection');
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
    const cubeAtlasUv = faceUv.add(vec2(column, row)).mul(vec2(1 / 3, 1 / 2));

    return texture(atlas, cubeAtlasUv).rgb.mul(uniform(new Color(tint)));
}

type InteriorMapMaterial = MeshStandardNodeMaterial;
const InteriorMapMaterialContext = createContext<Map<string, InteriorMapMaterial> | null>(null);

/** Owns one live material per interior configuration for the whole viewer tree. */
export function InteriorMapMaterialProvider({ children }: { children: ReactNode }) {
    const inherited = useContext(InteriorMapMaterialContext);
    const owned = useRef<Map<string, InteriorMapMaterial> | null>(null);
    if (!inherited && !owned.current) owned.current = new Map();

    useEffect(() => () => {
        owned.current?.forEach(material => material.dispose());
    }, []);

    if (inherited) return children;
    return <InteriorMapMaterialContext.Provider value={owned.current}>{children}</InteriorMapMaterialContext.Provider>;
}

function useInteriorMapMaterial(atlas: Texture | null, texturePath: string, roomSize: [number, number, number], tint: string) {
    const materials = useContext(InteriorMapMaterialContext);
    if (!materials) throw new Error('InteriorMap must be used inside <PrefabRoot>');
    const width = Math.max(0.001, roomSize[0]);
    const height = Math.max(0.001, roomSize[1]);
    const depth = Math.max(0.001, roomSize[2]);
    const tintKey = useMemo(() => new Color(tint).getHexString(), [tint]);
    const signature = `${texturePath}:${width}:${height}:${depth}:${tintKey}`;
    const material = useMemo(() => {
        const existing = materials.get(signature);
        if (existing) return existing;
        const value = new MeshStandardNodeMaterial({ color: '#000000', side: FrontSide, toneMapped: false });
        value.name = 'InteriorMap';
        materials.set(signature, value);
        return value;
    }, [materials, signature]);

    useLayoutEffect(() => {
        if (!atlas || material.userData.interiorAtlas === atlas.uuid) return;
        material.color.set('#ffffff');
        material.colorNode = createInteriorMapNode(atlas, [width, height, depth], `#${tintKey}`);
        material.toneMapped = true;
        material.userData.interiorAtlas = atlas.uuid;
        material.needsUpdate = true;
    }, [atlas, depth, height, material, tintKey, width]);

    return material;
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

function InteriorMapView({ properties, children }: ComponentViewProps<InteriorMapProperties>) {
    const { basePath } = usePrefab();
    const texturePath = withBasePath(basePath, properties.texture ?? DEFAULT_TEXTURE);
    const atlas = useTextureAsset(texturePath);
    const roomSize = properties.roomSize ?? [1, 1, 2.5];
    const tint = properties.color ?? '#ffffff';
    const material = useInteriorMapMaterial(atlas, texturePath, roomSize, tint);

    return <>
        <primitive object={material} attach={properties.attach ?? 'material'} dispose={null} />
        {children}
    </>;
}

const InteriorMapComponent: Component<InteriorMapProperties> = {
    name: 'InteriorMap',
    renderWhenDisabled: true,
    attachment: true,
    attach: 'material',
    Editor: InteriorMapEditor,
    View: InteriorMapView,
    properties: {
        attach: { type: 'string', default: 'material' },
        texture: { type: 'string', default: DEFAULT_TEXTURE },
        roomSize: { type: 'vector3', default: [1, 1, 2.5] },
        color: { type: 'color', default: '#ffffff' },
    },
};

export default InteriorMapComponent;
