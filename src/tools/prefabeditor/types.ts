export interface Prefab {
    id?: string;
    name?: string;
    root: GameObject;
}

export interface GameObject {
    id: string;
    disabled?: boolean;
    hidden?: boolean;
    children?: GameObject[];
    components?: {
        [key: string]: ComponentData | undefined;
    };
}

export interface ComponentData {
    type: string;
    properties: Record<string, any>;
}
