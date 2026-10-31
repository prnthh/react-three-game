// r187's addon has no DefinitelyTyped declaration yet.
declare module "three/examples/jsm/lighting/ClusteredLighting.js" {
  import { Lighting } from "three/webgpu";
  export class ClusteredLighting extends Lighting {
    dispose(): void;
    constructor(
      maxLights?: number,
      tileSize?: number,
      zSlices?: number,
      maxLightsPerCluster?: number,
    );
  }
}
