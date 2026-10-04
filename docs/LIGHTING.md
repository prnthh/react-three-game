# Lighting

Use built-in `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`, and `Environment` components in scene JSON. Their schemas provide editor controls.

## Image environment

To use an image for lighting and reflections, put a textured sphere **inside** an
`Environment` node. Use a `basic` material with `BackSide` so the capture camera
sees the image from inside the sphere without lighting changing its colors.
Any supported image texture works; an equirectangular panorama wraps naturally,
while an ordinary photo stretches around the sphere.

This window API batch adds both the material and its nodes. Obtain `scene` from
`window.scene`; only one agent-enabled editor is supported per page.

```js
const { rootId, revision } = scene.info();
scene.batch({ expectedRevision: revision, commands: [
  { op: 'material', id: 'sky-image', material: {
    materialType: 'basic', side: 'BackSide',
    texture: '/textures/skybox/skybox3.jpg', // Replace with your image URL.
  } },
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
        material: { type: 'Material', properties: { name: 'sky-image' } },
      },
    }],
  } },
] });
```

The captured map lights standard/physical materials, including compatible loaded
model materials; unlit/basic materials do not respond. `intensity` controls the
environment lighting. `backgroundIntensity` and `backgroundBlurriness` affect
only the visible sky; material roughness controls reflection blur. Set
`background: false` to retain lighting/reflections without showing the sky.

`Environment` uses `frames={1}`: it captures its children once per mount and reuses
the map, rather than recapturing every render frame. Environment setting changes
and visual-asset revisions remount the capture so newly loaded imagery is included.
This is a static environment, not a live reflection probe; animating its children
does not continuously update the map. The normal scene still renders each frame.

## Shadows

Enable `castShadow` on a light and the relevant meshes. Use one primary shadow caster first; add more only when the scene needs them.

Keep `shadowAutoUpdate: true` for moving lights or casters. For static scenes,
set it to `false` and refresh the Three light after changing geometry or lighting:

```tsx
// lightRef is a ref to your Three.js light.
lightRef.current.shadow.needsUpdate = true;
invalidate(); // useThree(state => state.invalidate), for demand-rendered canvases
```

This uses Three's native shadow state; no registration or game event is required.

For moving outdoor views, set `DirectionalLight.shadowCascades` to 2 or 3 and choose `shadowDistance`. Cascades follow the camera and update every frame. `shadowCascades: 1` uses an ordinary shadow map.

Custom R3F scenes can use `CascadedDirectionalLight` with `cascades`, `maxFar`, and ordinary light props. Keep the light and its target in the same coordinate space.
