# React Three Game docs

This Next.js workspace presents the built `react-three-game` package through focused examples.

## Workspace flow

```text
library source ──npm run build──▶ ../dist
                                    │
docs imports react-three-game ◀─────┘
```

The examples import the package entrypoints:

| Import | Usage |
|---|---|
| `react-three-game` | Runtime scenes and prefab APIs |
| `react-three-game/editor` | Visual authoring UI |
| `react-three-game/plugins/crashcat` | Physics demos |

## Run

From the repository root:

```bash
npm run dev
```

Production verification:

```bash
npm run build
npm --prefix docs run build
```

## Main routes

| Route | Concept |
|---|---|
| `/viewer` | `GameCanvas` and `PrefabRoot` |
| `/editor` | Optional `PrefabEditor` entrypoint |
| `/demo/customcomponent` | Registered component views and inferred inspector fields |
| `/demo/physics` | Nested prefabs, camera nodes, materials, events, Crashcat |
| `/demo/stage` | Runtime-only point-and-click scene viewer |
| `/demo/stage/editor` | Point-and-click scene browser and editor |
| `/demo/benchmark` | Instancing and rendering scale |
