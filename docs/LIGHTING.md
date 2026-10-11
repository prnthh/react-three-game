# Lighting

Use built-in `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`, and `Environment` components in scene JSON. Their schemas provide editor controls.

## Image environment

To use an image for lighting and reflections, put a textured sphere **inside** an
`Environment` node. Use a `basic` material with `BackSide` so the capture camera
sees the image from inside the sphere without lighting changing its colors.
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
`background: false` to retain lighting/reflections without showing the sky.

`Environment` uses `frames={1}` to capture a static map once per mount. Changes to
environment settings or visual assets refresh the capture. Use it for stable sky
and reflection lighting; the main scene continues rendering every frame.

## Shadows

Enable `castShadow` on a light and the relevant meshes. Use one primary shadow caster first; add more only when the scene needs them.

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
