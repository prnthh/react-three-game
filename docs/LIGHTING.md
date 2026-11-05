# Lighting

Use built-in `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`, and `Environment` components in scene JSON. Their schemas provide editor controls.

## Image environment

To use an image for lighting and reflections, put a textured sphere **inside** an
`Environment` node. Use a `basic` material with `BackSide` so the capture camera
sees the image’s unlit colors from inside the sphere.
Any supported image texture works; an equirectangular panorama wraps naturally,
while an ordinary photo stretches around the sphere.

In an editor, add an environment and its image sphere:

```js
const scene = window.scene;
await scene.setMode({ mode: 'edit' });
const { rootId, revision } = scene.info();
scene.batch({ expectedRevision: revision, commands: [
  { op: 'add', parentId: rootId, node: {
    id: 'sky', name: 'Sky environment',
    components: {
      environment: { type: 'Environment', properties: {
        intensity: 0.55, background: true,
        backgroundIntensity: 0.75, backgroundBlurriness: 0.1,
      } },
    },
    children: [{
      id: 'sky-sphere', name: 'Sky sphere',
      components: {
        geometry: { type: 'Geometry', properties: { geometryType: 'sphere' } },
        material: { type: 'Material', properties: {
          name: 'sky-image', materialType: 'basic', side: 'BackSide',
          texture: '/textures/skybox/skybox3.jpg', // Replace with your image URL.
        } },
      },
    }],
  } },
] });
```

The captured map lights standard/physical materials, including compatible loaded
model materials. Basic materials display their own unlit colors. `intensity` controls the
environment lighting. `backgroundIntensity` and `backgroundBlurriness` affect
only the visible sky; material roughness controls reflection blur. Set
`background: false` to use the capture for lighting and reflections alone.

`Environment` defaults to `frames: 1`: one capture after its child content changes.
Use `frames: 0` for continuous capture. Use a finite count for stable sky
and reflection lighting; the main scene continues rendering every frame.

## Surface response

The lit `Material` type (`standard`) uses `MeshPhysicalNodeMaterial`. `roughness`
controls reflections; `diffuseRoughness` controls r187's rough diffuse scattering
for concrete or clay. Start around `0.7` for matte masonry and leave it at `0`
for smooth surfaces. Transmission, thickness and IOR use the same physical material.
These values remain editable and serialize with the prefab.

## Authored sky, probes and render settings

The built-in `DiffuseLightProbe` projects authored sky/ground colors into nine
spherical-harmonic coefficients. Its `directionality` and world-space `axis`
approximate canyon openings with scene-wide diffuse lighting. `Environment` supplies the separate reflection capture
from an authored `Sky` child. Both remain static until their authored inputs change.

`Sky` exposes sun position, size, turbidity, Rayleigh and Mie scattering, and sun
disc visibility. Pair it with `DirectionalLight` for direct lighting and shadows.
`RenderSettings` on the scene root supplies optional tone mapping, exposure,
output color space and shadow overrides in Edit and Play. Unspecified fields keep
the renderer defaults; removing an override restores the previous value.

A separate root `PostProcessing` component enables ambient occlusion and bloom.
Enabled effects share their final composition with scene captures and shader preparation. These
components use ordinary inspector fields, agent commands and JSON serialization.

`ClusteredLighting` on the scene root opts into Three's clustered-lighting addon
for scenes with many point and spot lights. Its schema exposes light capacity
and cluster sizes.

These settings are part of the scene document, so a viewer and editor can use
the same authored appearance. For mesh batch cells and static-prefab residency, see [ChunkSettings](PREFABS.md#automatically-stream-static-scenery).

## Shadows

Enable renderer shadows with `RenderSettings.shadows: true` on the document
root, or through the host canvas. Also enable `castShadow` on the light and
casters, and `receiveShadow` on receiving meshes. Use one primary shadow caster
first; add more only when the scene needs them.

Keep `shadowAutoUpdate: true` for moving lights or casters. For static scenes,
set it to `false` and refresh the Three light after changing geometry or lighting:

```tsx
// lightRef is a ref to your Three.js light.
lightRef.current.shadow.needsUpdate = true;
invalidate(); // useThree(state => state.invalidate), for demand-rendered canvases
```

This refreshes Three's native shadow map.

For moving outdoor views, set `DirectionalLight.shadowCascades` to 2 or 3 and choose `shadowDistance`. Cascades follow the camera and update every frame. `shadowCascades: 1` uses an ordinary shadow map.

Custom R3F scenes can use `CascadedDirectionalLight` with `cascades`, `maxFar`, and ordinary light props. Keep the light and its target in the same coordinate space.
