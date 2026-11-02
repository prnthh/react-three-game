# Streamed world

Open `/demo/grassworld`. The page owns the terrain window, collider lifetime,
player controls and vegetation. Grass and flowers use dense billboard blades,
layered wind and recovering trails. These are demo features; for the library's
static-prefab residency, see the [prefab guide](../../../PREFABS.md#automatically-stream-static-scenery).

## Reuse the water component

The implementation is [Water.tsx](components/Water.tsx). Import `WaterComponent`,
call `registerComponent(WaterComponent)`, then add `{type:'Water', properties:{level:0,size:100,speed:0.1}}`
to a node. It needs an `Environment`, its normal-map asset (or a `normalMap` URL),
and `GameCanvas glConfig={{antialias:false}}`. Keep the surface horizontal and add colliders separately where needed. `followCamera:true` keeps water under a travelling camera; its world-space waves stay anchored.
