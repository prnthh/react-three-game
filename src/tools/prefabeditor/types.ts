// import { ThreeElements } from "@react-three/fiber"

export interface Prefab {
    id?: string;
    name?: string;
    description?: string;
    author?: string;
    version?: string;
    assets?: string[] | {[assetName: string]: string}; // List of asset URLs or a mapping of asset names to URLs
    onStart?: (target: any) => void; // The logic function to run when the map starts
    root: GameObject; // The root node of the scene graph
}

export interface GameObject {
    id: string;
    disabled?: boolean;
    hidden?: boolean;
    ref?: any;
    children?: GameObject[];
    components?: {
        [uuid: string]: Component | undefined;
    };
}

interface Component {
    type: string;
    properties: { [key: string]: any };
}
