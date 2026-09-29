# Lighting

Use built-in `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`, and `Environment` components in scene JSON. Their schemas provide editor controls.

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
