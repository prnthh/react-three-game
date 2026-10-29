import { createNodeComponentType } from '../scene/SceneContext.js';
import { resolveGameObject } from '../scene/gameObject.js';
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, NoColorSpace, type Mesh, type Object3D, type Texture, Vector2 } from 'three';
import { uniform } from 'three/tsl';
import { normalizeWeightMap } from './terrainData.js';

export function imagePixels(texture: Texture, size?: number): HTMLCanvasElement {
    const image = texture.image as CanvasImageSource & { width: number; height: number };
    const canvas = document.createElement('canvas');
    canvas.width = size ?? Math.min(image.width, 4096);
    canvas.height = size ?? Math.min(image.height, 4096);
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Fail explicitly for unreadable cross-origin maps; never silently flatten terrain.
    context.getImageData(0, 0, canvas.width, canvas.height);
    return canvas;
}
export function pixels(canvas: HTMLCanvasElement): ImageData {
    return canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
}
export function createWeightSurface(source: Texture | null, resolution: number) {
    const canvas = source ? imagePixels(source, resolution) : document.createElement('canvas');
    if (!source) {
        canvas.width = canvas.height = resolution;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ff0000'; // layer zero
        context.fillRect(0, 0, resolution, resolution);
    }
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const image = context.getImageData(0, 0, resolution, resolution);
    normalizeWeightMap(image);
    context.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = NoColorSpace;
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    return { canvas, texture, brushCenter: uniform(new Vector2(-10, -10)), brushRadius: uniform(new Vector2(0.01, 0.01)), brushVisible: uniform(0) };
}
export type TerrainSurface = ReturnType<typeof createWeightSurface> & { mesh: Mesh; width: number; depth: number; ready?: boolean };
/** Reuse scene component ownership instead of searching arbitrary descendant meshes. */
export const TERRAIN_SURFACE_COMPONENT = createNodeComponentType<TerrainSurface>('TerrainSurface');
export const TERRAIN_FAILURE_COMPONENT = createNodeComponentType<string>('TerrainFailure');
export function findTerrainSurface(root: Object3D | null): TerrainSurface | null {
    return root ? resolveGameObject(root)?.getComponent(TERRAIN_SURFACE_COMPONENT) ?? null : null;
}
export function getTerrainFailure(root: Object3D | null): string | null {
    return root ? resolveGameObject(root)?.getComponent(TERRAIN_FAILURE_COMPONENT) ?? null : null;
}
