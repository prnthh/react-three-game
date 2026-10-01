export type AssetDependency = { kind: 'model' | 'texture' | 'sound'; path: string };
export type ComponentDependency = AssetDependency | { kind: 'prefab'; path: string };

