# Rendering and authoring examples

These routes are host applications built with React Three Game. Their game loops,
controllers, world residency and narrative systems are examples, not engine APIs.

Run `npm run dev` from the repository root. Demos import the built library from `dist`; `npm run build` rebuilds it. Verify production with `npm --prefix docs run build`.

| Route | Starting point |
| --- | --- |
| `/` | [City composition](app/components/DemoApp.tsx) |
| `/viewer` | [Viewer](app/viewer/page.tsx) |
| `/editor` | [Editor integration](app/editor/page.tsx) |
| `/editor/agents` | [Read/edit examples](editor-api-for-agents.md) |
| `/demo/jumper` | [First-person controller + dynamic roster](app/demo/jumper/README.md) |
| `/demo/customcomponent` | [Component and registration](app/demo/customcomponent/page.tsx) |
| `/demo/grassworld` | [Terrain composition](app/demo/grassworld/page.tsx) |
| `/demo/interior` | [Interior scene](app/demo/interior/page.tsx) |
| `/demo/interior/editor` | [Interior editor](app/demo/interior/editor/page.tsx) |
| `/demo/physics` | [Physics integration](app/demo/physics/page.tsx) |
| `/demo/stage` | [Stage game](app/demo/stage/page.tsx) |
| `/demo/stage/editor` | [Stage editor](app/demo/stage/editor/page.tsx) |
| `/demo/benchmark` | [Benchmark](app/demo/benchmark/page.tsx) |

Edit prefab JSON in `public/prefabs` directly. Builds do not generate scenes.

Keep specialized demo components under their demo. Interior mapping and the jumper controller are examples, not built-in engine systems.

See [architecture](ARCHITECTURE.md), [lighting](LIGHTING.md), and [interior mapping](INTERIOR-MAPPING.md).
