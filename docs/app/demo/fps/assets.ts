import { withBasePath } from "../../basePath";
import { EXTRA_ANIMATIONS } from "./animation";

export const asset = (name: string) => withBasePath(`/models/fps/${name}.glb`);
export const animationURLs = EXTRA_ANIMATIONS.map(name => withBasePath(`/models/fps/animations/${name}.fbx`));
