import type { PrefabMaterial } from './types.js';

export type AssetDependency = { kind: 'model' | 'texture' | 'sound'; path: string };
export type ComponentDependency = AssetDependency | { kind: 'prefab'; path: string };

export function materialTextureDependencies(properties: PrefabMaterial): { kind: 'texture'; path: string }[] {
    return [properties.texture, properties.normalMapTexture]
        .filter((path): path is string => !!path).map(path => ({ kind: 'texture', path }));
}
