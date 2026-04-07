"use client";

import { Component, loadTexture } from "react-three-game";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    LinearFilter,
    LinearMipmapLinearFilter,
    NearestFilter,
    RepeatWrapping,
    SRGBColorSpace,
    Texture,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";

type BrushFace = {
    vertices: [number, number, number][];
    uvs: [number, number][];
    texture: string;
    minFilter?: string;
    magFilter?: string;
    generateMipmaps?: boolean;
};

type QuakeBrushProps = {
    faces?: BrushFace[];
    roughness?: number;
};

const minFilterMap = {
    NearestFilter,
    LinearFilter,
    LinearMipmapLinearFilter,
} as const;

const magFilterMap = {
    NearestFilter,
    LinearFilter,
} as const;

function EmptyEditor() {
    return null;
}

function buildMergedGeometry(faces: BrushFace[]) {
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    faces.forEach((face) => {
        positions.push(...face.vertices.flat());
        uvs.push(...face.uvs.flat());

        for (let index = 1; index < face.vertices.length - 1; index += 1) {
            indices.push(vertexOffset, vertexOffset + index, vertexOffset + index + 1);
        }

        vertexOffset += face.vertices.length;
    });

    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

function configureTexture(texture: Texture, face: BrushFace) {
    const nextTexture = texture.clone();
    nextTexture.wrapS = RepeatWrapping;
    nextTexture.wrapT = RepeatWrapping;
    nextTexture.colorSpace = SRGBColorSpace;
    nextTexture.minFilter = minFilterMap[face.minFilter as keyof typeof minFilterMap] ?? LinearMipmapLinearFilter;
    nextTexture.magFilter = magFilterMap[face.magFilter as keyof typeof magFilterMap] ?? LinearFilter;
    nextTexture.generateMipmaps = face.generateMipmaps ?? true;
    nextTexture.needsUpdate = true;
    return nextTexture;
}

function QuakeBrushView({ properties, loadedTextures = {} }: { properties: QuakeBrushProps; loadedTextures?: Record<string, Texture> }) {
    const faces = properties.faces ?? [];
    const roughness = properties.roughness ?? 1;
    const [localTextures, setLocalTextures] = useState<Record<string, Texture>>({});
    const localTexturesRef = useRef<Record<string, Texture>>({});

    useEffect(() => {
        localTexturesRef.current = localTextures;
    }, [localTextures]);

    useEffect(() => {
        const texturePaths = Array.from(new Set(faces.map((face) => face.texture)));
        const missingTexturePaths = texturePaths.filter((path) => !loadedTextures[path] && !localTextures[path]);

        if (missingTexturePaths.length === 0) {
            return;
        }

        let cancelled = false;

        void Promise.all(
            missingTexturePaths.map(async (path) => {
                const result = await loadTexture(path);
                return result.success && result.texture ? [path, result.texture] as const : null;
            }),
        ).then((entries) => {
            if (cancelled) {
                entries.forEach((entry) => entry?.[1].dispose());
                return;
            }

            const resolvedEntries = entries.filter((entry): entry is readonly [string, Texture] => entry !== null);
            if (resolvedEntries.length === 0) {
                return;
            }

            setLocalTextures((prev) => {
                const next = { ...prev };

                resolvedEntries.forEach(([path, texture]) => {
                    if (next[path]) {
                        texture.dispose();
                        return;
                    }

                    next[path] = texture;
                });

                return next;
            });
        });

        return () => {
            cancelled = true;
        };
    }, [faces, loadedTextures, localTextures]);

    useEffect(() => {
        return () => {
            Object.values(localTexturesRef.current).forEach((texture) => texture.dispose());
        };
    }, []);

    const availableTextures = useMemo(
        () => ({ ...localTextures, ...loadedTextures }),
        [loadedTextures, localTextures],
    );

    const renderedFaces = useMemo(() => {
        const facesByMaterial = new Map<string, BrushFace[]>();

        faces.forEach((face) => {
            const materialKey = [
                face.texture,
                face.minFilter ?? "",
                face.magFilter ?? "",
                face.generateMipmaps ? "1" : "0",
            ].join("|");
            const bucket = facesByMaterial.get(materialKey);
            if (bucket) {
                bucket.push(face);
                return;
            }
            facesByMaterial.set(materialKey, [face]);
        });

        return Array.from(facesByMaterial.entries()).map(([materialKey, groupedFaces]) => {
            const sampleFace = groupedFaces[0];
            const geometry = buildMergedGeometry(groupedFaces);
            const sourceTexture = availableTextures[sampleFace.texture];
            const configuredTexture = sourceTexture
                ? configureTexture(sourceTexture, sampleFace)
                : null;
            const material = new MeshStandardNodeMaterial();

            material.map = configuredTexture ?? null;
            material.side = DoubleSide;
            material.roughness = roughness;
            material.needsUpdate = true;

            return {
                key: materialKey,
                geometry,
                configuredTexture,
                material,
            };
        });
    }, [availableTextures, faces, roughness]);

    useEffect(() => {
        return () => {
            renderedFaces.forEach(({ geometry, configuredTexture, material }) => {
                geometry.dispose();
                configuredTexture?.dispose();
                material.dispose();
            });
        };
    }, [renderedFaces]);

    return (
        <group>
            {renderedFaces.map(({ key, geometry, material }) => (
                <mesh key={key} geometry={geometry} material={material} castShadow receiveShadow />
            ))}
        </group>
    );
}

const QuakeBrushComponent: Component = {
    name: "QuakeBrush",
    Editor: EmptyEditor,
    View: QuakeBrushView,
    defaultProperties: {
        faces: [],
        roughness: 0.8,
    },
};

export default QuakeBrushComponent;